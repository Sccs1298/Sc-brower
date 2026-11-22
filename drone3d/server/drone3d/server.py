"""Drone3D live server (desktop / laptop).

  python -m drone3d.server [--port 8080] [--source rtmp://.../live/drone] [--record sessions]

* /ws/drone   - the phone app streams JPEG frames + DJI telemetry here
* /ws/viewer  - browsers receive the growing model (and may send {"cmd": ...})
* /           - the live 3D viewer
* /api/state, /api/structure, /api/export.ply, /api/reset (POST), /api/session/finish (POST),
  /api/command (POST json, same commands as the viewer)
"""
import argparse
import asyncio
import json
import logging
import os
import threading
import time

import cv2
from aiohttp import web, WSMsgType

from .engine import Engine
from .protocol import decode_frame

log = logging.getLogger("drone3d")
VIEWER_DIR = os.path.join(os.path.dirname(__file__), "..", "viewer")


class Session:
    """Async wrapper: keeps only the latest frame, runs the Engine in a worker thread, fans out."""

    def __init__(self, record_root=None, mapper_cfg=None, calib_path=None):
        self.engine = Engine(mapper_cfg, record_root, calib_path)
        self.viewers = set()
        self.pending = None
        self.wake = asyncio.Event()
        self.received = 0
        self.dropped = 0
        self.drone_connected = False

    @property
    def mapper(self):
        return self.engine.mapper

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
                msgs = await loop.run_in_executor(None, self.engine.process_jpeg, item[1], item[0])
            except Exception:
                log.exception("processing failed")
                continue
            await self.send_all(msgs)
            if self.pending is not None:
                self.wake.set()

    async def send_all(self, msgs, targets=None):
        dead = []
        for ws in list(targets or self.viewers):
            try:
                for kind, data in msgs:
                    if kind == "bin":
                        await ws.send_bytes(data)
                    else:
                        await ws.send_str(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.viewers.discard(ws)

    async def command(self, cmd):
        loop = asyncio.get_running_loop()
        reply, msgs = await loop.run_in_executor(None, self.engine.command, cmd)
        await self.send_all(msgs)
        return reply


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
                reply = await s.command(cmd) if cmd.get("cmd") not in (None, "status") else {}
                await ws.send_str(json.dumps(dict(type="ack", received=s.received,
                                                  processed=s.engine.processed, **reply)))
    finally:
        s.drone_connected = False
        log.info("drone disconnected")
    return ws


async def viewer_ws(request):
    s: Session = request.app["session"]
    ws = web.WebSocketResponse(heartbeat=15)
    await ws.prepare(request)
    s.viewers.add(ws)
    await s.send_all(s.engine.snapshot(), [ws])
    try:
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            if msg.data == "snapshot":
                await s.send_all(s.engine.snapshot(), [ws])
                continue
            reply = await s.command(json.loads(msg.data))
            await ws.send_str(json.dumps(dict(type="reply", **reply)))
    finally:
        s.viewers.discard(ws)
    return ws


async def index(request):
    return web.FileResponse(os.path.join(VIEWER_DIR, "index.html"))


async def api_state(request):
    s: Session = request.app["session"]
    st, _ = s.engine.command({"cmd": "state"})
    st.update(received=s.received, dropped=s.dropped, viewers=len(s.viewers), drone_connected=s.drone_connected)
    return web.json_response(st)


async def api_structure(request):
    s: Session = request.app["session"]
    await s.command({"cmd": "structure"})
    return web.json_response(s.engine.structure or dict(planes=[], storeys=None, openings=[]))


async def api_export(request):
    s: Session = request.app["session"]
    data = await asyncio.get_running_loop().run_in_executor(None, s.engine.export_ply_bytes)
    return web.Response(body=data, content_type="application/octet-stream",
                        headers={"Content-Disposition": 'attachment; filename="drone3d_model.ply"'})


async def api_reset(request):
    return web.json_response(await request.app["session"].command({"cmd": "reset"}))


async def api_finish(request):
    reply = await request.app["session"].command({"cmd": "finish"})
    return web.json_response(dict(ok=reply.get("session_dir") is not None, **reply))


async def api_command(request):
    return web.json_response(await request.app["session"].command(await request.json()))


def video_source_thread(session: Session, loop, url, fps, hfov):
    """Video-only mode (e.g. RTMP from DJI Fly): no telemetry -> scale set manually."""
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


def make_app(record_root=None, mapper_cfg=None, calib_path=None):
    app = web.Application(client_max_size=32 * 1024 * 1024)
    app.add_routes([
        web.get("/", index),
        web.get("/chessboard_9x6.png", lambda r: web.FileResponse(os.path.join(VIEWER_DIR, "chessboard_9x6.png"))),
        web.get("/ws/drone", drone_ws),
        web.get("/ws/viewer", viewer_ws),
        web.get("/api/state", api_state),
        web.get("/api/structure", api_structure),
        web.get("/api/export.ply", api_export),
        web.post("/api/reset", api_reset),
        web.post("/api/session/finish", api_finish),
        web.post("/api/command", api_command),
        web.static("/vendor", os.path.join(VIEWER_DIR, "vendor")),
        web.static("/static", VIEWER_DIR),
    ])

    async def start(app):
        app["session"] = Session(record_root, mapper_cfg, calib_path)
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
    ap.add_argument("--screen", action="store_true",
                    help="frames are screen recordings of DJI Fly (mask the on-screen display)")
    ap.add_argument("--calib", help="lens calibration json (created by the calibration mode)")
    ap.add_argument("--airplay", action="store_true",
                    help="iPhone mode: grab this computer's screen where the iPhone (DJI Fly) is mirrored by AirPlay")
    ap.add_argument("--window", help="with --airplay: title of the AirPlay receiver window (e.g. UxPlay)")
    ap.add_argument("--monitor", type=int, default=1, help="with --airplay: monitor to grab (1 = main)")
    ap.add_argument("--region", help="with --airplay: grab only x,y,w,h of the screen")
    ap.add_argument("--no-ocr", action="store_true", help="with --airplay: do not read the height H from the screen")
    ap.add_argument("--no-dense", action="store_true")
    a = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = {}
    if a.no_dense:
        cfg["dense"] = False
    if a.hfov:
        cfg["hfov"] = a.hfov
    if a.screen or a.airplay:
        cfg["auto_overlay_mask"] = True
    calib = a.calib or ("calibration.json" if (a.airplay or a.screen) else None)   # calibration mode saves here
    app = make_app(a.record or None, cfg, calib)
    if a.source:
        async def start_src(app):
            loop = asyncio.get_running_loop()
            threading.Thread(target=video_source_thread, args=(app["session"], loop, a.source, a.fps, a.hfov),
                             daemon=True).start()
        app.on_startup.append(start_src)
    if a.airplay:
        from .capture import screen_source_thread

        async def start_grab(app):
            loop = asyncio.get_running_loop()
            sess = app["session"]
            region = tuple(int(v) for v in a.region.split(",")) if a.region else None
            threading.Thread(target=screen_source_thread, daemon=True, kwargs=dict(
                submit=lambda tm, jpg: loop.call_soon_threadsafe(sess.submit, tm, jpg),
                fps=a.fps if a.fps != 4.0 else 3.0, monitor=a.monitor, region=region, window=a.window,
                ocr=not a.no_ocr)).start()
        app.on_startup.append(start_grab)
    print(f"Drone3D server: open http://<this-computer-ip>:{a.port}/ in a browser; phone app -> ws://<ip>:{a.port}/ws/drone")
    web.run_app(app, host=a.host, port=a.port, print=None)


if __name__ == "__main__":
    main()
