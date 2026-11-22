"""Drone3D live server.

  python -m drone3d.server [--port 8080] [--source rtmp://.../live/drone] [--record sessions]

* /ws/drone   - the phone app streams JPEG frames + DJI telemetry here
* /ws/viewer  - browsers / the phone's WebView receive the growing model
* /           - the live 3D viewer
* /api/state, /api/structure, /api/export.ply, /api/reset (POST), /api/session/finish (POST)
"""
import argparse
import asyncio
import json
import logging
import os
import threading
import time

import cv2
import numpy as np
from aiohttp import web, WSMsgType

from .slam import Mapper
from .structure import analyse
from .protocol import decode_frame, encode_points
from .export import write_ply, write_transforms, session_dir

log = logging.getLogger("drone3d")
VIEWER_DIR = os.path.join(os.path.dirname(__file__), "..", "viewer")


class Session:
    """Holds the mapper and fans results out to viewers."""

    def __init__(self, record_root=None, mapper_cfg=None):
        self.mapper_cfg = mapper_cfg or {}
        self.mapper = Mapper(**self.mapper_cfg)
        self.viewers = set()
        self.pending = None               # latest (telemetry, jpeg) not yet processed
        self.wake = asyncio.Event()
        self.lock = threading.Lock()
        self.received = 0
        self.dropped = 0
        self.processed = 0
        self.last_result = {}
        self.structure = None
        self.structure_kf = 0
        self.record_root = record_root
        self.rec_dir = None
        self.rec_file = None
        self.rec_frames = []              # (name, frame_id) for transforms export
        self.drone_connected = False
        self._new_session_dir()

    def _new_session_dir(self):
        if self.rec_file:
            self.rec_file.close()
        self.rec_dir = self.rec_file = None
        self.rec_frames = []
        if self.record_root:
            self.rec_dir = session_dir(self.record_root, time.strftime("%Y%m%d-%H%M%S"))
            self.rec_file = open(os.path.join(self.rec_dir, "telemetry.jsonl"), "a")

    def reset(self):
        with self.lock:
            self.mapper = Mapper(**self.mapper_cfg)
            self.structure = None
            self.structure_kf = 0
            self.processed = 0
            self._new_session_dir()

    # ---------------------------------------------------------------- ingest
    def submit(self, tm, jpeg):
        self.received += 1
        if self.pending is not None:
            self.dropped += 1
        self.pending = (tm, jpeg)
        self.wake.set()

    async def run(self):
        loop = asyncio.get_running_loop()
        while True:
            await self.wake.wait()
            self.wake.clear()
            item, self.pending = self.pending, None
            if item is None:
                continue
            try:
                res = await loop.run_in_executor(None, self._process, *item)
            except Exception:
                log.exception("processing failed")
                continue
            if res:
                await self._broadcast_result(res)
            if self.pending is not None:
                self.wake.set()

    def _process(self, tm, jpeg):
        img = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return None
        with self.lock:
            res = self.mapper.process(img, tm)
            self.processed += 1
            if self.rec_dir:
                name = f"frames/{self.processed:06d}.jpg"
                with open(os.path.join(self.rec_dir, name), "wb") as f:
                    f.write(jpeg)
                self.rec_file.write(json.dumps(dict(frame=os.path.basename(name), **tm)) + "\n")
                if res["pose"] is not None:
                    self.rec_frames.append((name, res["pose"][0].tolist(), res["pose"][1].tolist()))
            n_kf = len(self.mapper.kfs)
            if res["keyframe"] and n_kf - self.structure_kf >= 6 and self.mapper.voxels is not None:
                xyz, _ = self.mapper.voxels.points()
                self.structure = analyse(xyz, gravity=self.mapper.metric)
                self.structure_kf = n_kf
                res["structure"] = self.structure
        self.last_result = res
        return res

    # ------------------------------------------------------------- broadcast
    def _pose_msg(self, res):
        msg = dict(type="pose", state=res["state"], stats=res["stats"], received=self.received,
                   dropped=self.dropped, drone_connected=self.drone_connected)
        if res["pose"] is not None:
            R, C = res["pose"]
            msg.update(R=np.round(R, 5).tolist(), C=np.round(C, 3).tolist())
        if res.get("telemetry_pose") is not None:
            msg["C_tel"] = np.round(res["telemetry_pose"][1], 3).tolist()
        return json.dumps(msg)

    async def _send_all(self, data):
        dead = []
        for ws in self.viewers:
            try:
                if isinstance(data, bytes):
                    await ws.send_bytes(data)
                else:
                    await ws.send_str(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.viewers.discard(ws)

    async def _broadcast_result(self, res):
        if len(res["new_xyz"]):
            await self._send_all(encode_points(res["new_xyz"], res["new_rgb"]))
        await self._send_all(self._pose_msg(res))
        if res.get("structure") is not None:
            await self._send_all(json.dumps(dict(type="structure", **res["structure"])))

    async def snapshot(self, ws):
        with self.lock:
            m = self.mapper
            xyz, rgb = m.voxels.points() if m.voxels is not None else (np.zeros((0, 3)), np.zeros((0, 3)))
            traj = [np.round(c, 3).tolist() for c in m.trajectory[-5000:]]
        await ws.send_str(json.dumps(dict(type="reset")))
        step = 200000
        for i in range(0, len(xyz), step):
            await ws.send_bytes(encode_points(xyz[i:i + step], rgb[i:i + step]))
        await ws.send_str(json.dumps(dict(type="trajectory", points=traj)))
        if self.structure:
            await ws.send_str(json.dumps(dict(type="structure", **self.structure)))
        if self.last_result:
            await ws.send_str(self._pose_msg(self.last_result))

    # ---------------------------------------------------------------- export
    def export_ply(self):
        with self.lock:
            if self.mapper.voxels is None:
                return write_ply_bytes(np.zeros((0, 3)), np.zeros((0, 3)))
            xyz, rgb = self.mapper.voxels.points()
        return write_ply_bytes(xyz, rgb)

    def finish(self):
        """Write model.ply, structure.json, transforms.json into the session folder."""
        if not self.rec_dir:
            return None
        with self.lock:
            m = self.mapper
            if m.voxels is not None:
                xyz, rgb = m.voxels.points()
                write_ply(os.path.join(self.rec_dir, "model.ply"), xyz, rgb)
                self.structure = analyse(xyz, gravity=m.metric)
                json.dump(self.structure, open(os.path.join(self.rec_dir, "structure.json"), "w"), indent=1)
            if m.K is not None and self.rec_frames:
                frames = [(n, np.array(R), np.array(C)) for n, R, C in self.rec_frames]
                write_transforms(os.path.join(self.rec_dir, "transforms.json"), m.K, m.size, frames)
            self.rec_file.flush()
        return self.rec_dir


def write_ply_bytes(xyz, rgb):
    import io
    b = io.BytesIO()
    write_ply(b, xyz, rgb)
    return b.getvalue()


# -------------------------------------------------------------------- routes
async def drone_ws(request):
    s: Session = request.app["session"]
    ws = web.WebSocketResponse(max_msg_size=16 * 1024 * 1024, heartbeat=10)
    await ws.prepare(request)
    s.drone_connected = True
    log.info("drone connected from %s", request.remote)
    try:
        async for msg in ws:
            if msg.type == WSMsgType.BINARY:
                try:
                    tm, jpeg = decode_frame(msg.data)
                except Exception as e:
                    log.warning("bad frame: %s", e)
                    continue
                s.submit(tm, jpeg)
            elif msg.type == WSMsgType.TEXT:
                cmd = json.loads(msg.data)
                if cmd.get("cmd") == "reset":
                    s.reset()
                    await s._send_all(json.dumps(dict(type="reset")))
                await ws.send_str(json.dumps(dict(type="ack", received=s.received, processed=s.processed)))
    finally:
        s.drone_connected = False
        log.info("drone disconnected")
    return ws


async def viewer_ws(request):
    s: Session = request.app["session"]
    ws = web.WebSocketResponse(heartbeat=15)
    await ws.prepare(request)
    s.viewers.add(ws)
    await s.snapshot(ws)
    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT and msg.data == "snapshot":
                await s.snapshot(ws)
    finally:
        s.viewers.discard(ws)
    return ws


async def index(request):
    return web.FileResponse(os.path.join(VIEWER_DIR, "index.html"))


async def api_state(request):
    s: Session = request.app["session"]
    st = s.mapper.stats()
    st.update(received=s.received, processed=s.processed, dropped=s.dropped, viewers=len(s.viewers),
              drone_connected=s.drone_connected, state=s.mapper.state, session_dir=s.rec_dir)
    return web.json_response(st)


async def api_structure(request):
    s: Session = request.app["session"]
    loop = asyncio.get_running_loop()

    def run():
        with s.lock:
            if s.mapper.voxels is None:
                return dict(planes=[], storeys=None, openings=[])
            xyz, _ = s.mapper.voxels.points()
            s.structure = analyse(xyz, gravity=s.mapper.metric)
            return s.structure
    return web.json_response(await loop.run_in_executor(None, run))


async def api_export(request):
    s: Session = request.app["session"]
    data = await asyncio.get_running_loop().run_in_executor(None, s.export_ply)
    return web.Response(body=data, content_type="application/octet-stream",
                        headers={"Content-Disposition": 'attachment; filename="drone3d_model.ply"'})


async def api_reset(request):
    s: Session = request.app["session"]
    s.reset()
    await s._send_all(json.dumps(dict(type="reset")))
    return web.json_response(dict(ok=True))


async def api_finish(request):
    s: Session = request.app["session"]
    d = await asyncio.get_running_loop().run_in_executor(None, s.finish)
    return web.json_response(dict(ok=d is not None, session_dir=d))


def video_source_thread(session: Session, loop, url, fps, hfov):
    """Video-only mode (e.g. RTMP from DJI Fly): no telemetry -> scale is arbitrary."""
    period = 1.0 / fps
    while True:
        cap = cv2.VideoCapture(url)
        if not cap.isOpened():
            log.warning("cannot open %s, retrying", url)
            time.sleep(2)
            continue
        log.info("reading video from %s", url)
        last = 0.0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            now = time.time()
            if now - last < period:
                continue
            last = now
            ok, jpg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            tm = dict(t=int(now * 1000), hfov=hfov) if hfov else dict(t=int(now * 1000))
            loop.call_soon_threadsafe(session.submit, tm, jpg.tobytes())
        cap.release()
        time.sleep(1)


def make_app(record_root=None, mapper_cfg=None):
    app = web.Application(client_max_size=32 * 1024 * 1024)
    app.add_routes([
        web.get("/", index),
        web.get("/ws/drone", drone_ws),
        web.get("/ws/viewer", viewer_ws),
        web.get("/api/state", api_state),
        web.get("/api/structure", api_structure),
        web.get("/api/export.ply", api_export),
        web.post("/api/reset", api_reset),
        web.post("/api/session/finish", api_finish),
        web.static("/static", VIEWER_DIR),
    ])

    async def start(app):
        app["session"] = Session(record_root, mapper_cfg)
        app["task"] = asyncio.create_task(app["session"].run())

    async def stop(app):
        app["task"].cancel()
    app.on_startup.append(start)
    app.on_cleanup.append(stop)
    return app


def main():
    ap = argparse.ArgumentParser(description="Drone3D live reconstruction server")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--record", default="sessions", help="folder for recorded flights ('' to disable)")
    ap.add_argument("--source", help="video URL/file for video-only mode (RTMP from DJI Fly, .mp4 ...)")
    ap.add_argument("--fps", type=float, default=4.0, help="frames/s taken from --source")
    ap.add_argument("--hfov", type=float, help="horizontal FOV of the stream (deg)")
    ap.add_argument("--no-dense", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = {}
    if a.no_dense:
        cfg["dense"] = False
    if a.hfov:
        cfg["hfov"] = a.hfov
    app = make_app(a.record or None, cfg)
    if a.source:
        async def start_src(app):
            loop = asyncio.get_running_loop()
            threading.Thread(target=video_source_thread, args=(app["session"], loop, a.source, a.fps, a.hfov),
                             daemon=True).start()
        app.on_startup.append(start_src)
    print(f"Drone3D server: open http://<this-computer-ip>:{a.port}/ in a browser; phone app -> ws://<ip>:{a.port}/ws/drone")
    web.run_app(app, host=a.host, port=a.port, print=None)


if __name__ == "__main__":
    main()
