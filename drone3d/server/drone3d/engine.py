"""Synchronous core shared by the desktop server and the on-phone plugin.

Engine.process(...) turns one frame (+ optional telemetry) into a list of
outgoing messages for viewers:
    ("bin", PTS1 point batch)   or   ("json", '{"type": ...}')
"""
import base64
import io
import json
import os
import threading
import time

import cv2
import numpy as np

from .export import write_ply, write_transforms, session_dir
from .protocol import encode_points
from .screen import Calibrator, load_calibration, save_calibration
from .slam import Mapper
from .structure import analyse

STANDARD_DOOR_HEIGHT_M = 2.05


class Engine:
    def __init__(self, mapper_cfg=None, record_root=None, calib_path=None):
        self.mapper_cfg = dict(mapper_cfg or {})
        self.calib_path = calib_path
        if calib_path and os.path.exists(calib_path) and "calib" not in self.mapper_cfg:
            self.mapper_cfg["calib"] = load_calibration(calib_path)
        self.lock = threading.RLock()
        self.mapper = Mapper(**self.mapper_cfg)
        self.structure = None
        self.structure_kf = 0
        self.processed = 0
        self.last_result = {}
        self.record_root = record_root
        self.rec_dir = None
        self.rec_file = None
        self.rec_frames = []
        self.calibrator = None
        self._new_session_dir()

    # ------------------------------------------------------------- sessions
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
            self.last_result = {}
            self._new_session_dir()
        return [("json", json.dumps(dict(type="reset")))]

    # -------------------------------------------------------------- frames
    def process_jpeg(self, jpeg, tm):
        img = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return []
        return self.process(img, tm, jpeg)

    def process_rgba(self, buf, width, height, row_stride, tm):
        """Raw RGBA_8888 from an Android ImageReader (row_stride in bytes)."""
        a = np.frombuffer(buf, np.uint8)[: height * row_stride].reshape(height, row_stride)
        img = cv2.cvtColor(a[:, : width * 4].reshape(height, width, 4), cv2.COLOR_RGBA2BGR)
        return self.process(img, tm)

    def process(self, img, tm=None, jpeg=None):
        tm = tm or {}
        if self.calibrator is not None:
            return self._calibration_step(img, tm)
        with self.lock:
            res = self.mapper.process(img, tm)
            self.processed += 1
            if self.rec_dir:
                name = f"frames/{self.processed:06d}.jpg"
                if jpeg is None:
                    jpeg = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 90])[1].tobytes()
                with open(os.path.join(self.rec_dir, name), "wb") as f:
                    f.write(jpeg)
                self.rec_file.write(json.dumps(dict(frame=os.path.basename(name), **tm)) + "\n")
                if res["pose"] is not None:
                    self.rec_frames.append((name, res["pose"][0].tolist(), res["pose"][1].tolist()))
            n_kf = len(self.mapper.kfs)
            if res["keyframe"] and n_kf - self.structure_kf >= 6 and self.mapper.voxels is not None:
                self._analyse()
                self.structure_kf = n_kf
                res["structure"] = self.structure
            self.last_result = res
            return self._messages(res)

    def _gravity_known(self):
        return self.mapper.gravity_aligned or any(k.R_tel is not None for k in self.mapper.kfs)

    def _analyse(self):
        xyz, _ = self.mapper.voxels.points()
        self.structure = analyse(xyz, gravity=self._gravity_known())
        self.structure["metric"] = bool(self.mapper.metric)
        return self.structure

    # ------------------------------------------------------------ messages
    def pose_msg(self, res):
        msg = dict(type="pose", state=res["state"], stats=res["stats"], processed=self.processed)
        if res.get("pose") is not None:
            R, C = res["pose"]
            msg.update(R=np.round(R, 5).tolist(), C=np.round(C, 3).tolist())
        if res.get("telemetry_pose") is not None:
            msg["C_tel"] = np.round(res["telemetry_pose"][1], 3).tolist()
        return json.dumps(msg)

    def _messages(self, res):
        if res.get("rescaled"):
            out = self.snapshot()     # whole map moved (scale / gravity fix): resend everything
        else:
            out = []
            if len(res["new_xyz"]):
                out.append(("bin", encode_points(res["new_xyz"], res["new_rgb"])))
        out.append(("json", self.pose_msg(res)))
        if res.get("structure") is not None:
            out.append(("json", json.dumps(dict(type="structure", **res["structure"]))))
        return out

    def snapshot(self):
        with self.lock:
            m = self.mapper
            xyz, rgb = m.voxels.points() if m.voxels is not None else (np.zeros((0, 3)), np.zeros((0, 3)))
            traj = [np.round(c, 3).tolist() for c in m.trajectory[-5000:]]
            out = [("json", json.dumps(dict(type="reset")))]
            step = 200000
            for i in range(0, len(xyz), step):
                out.append(("bin", encode_points(xyz[i:i + step], rgb[i:i + step])))
            out.append(("json", json.dumps(dict(type="trajectory", points=traj))))
            if self.structure:
                out.append(("json", json.dumps(dict(type="structure", **self.structure))))
            if self.last_result:
                out.append(("json", self.pose_msg(self.last_result)))
        return out

    # ------------------------------------------------------------ commands
    def command(self, cmd):
        """JSON-able commands from the viewer / app. Returns (reply_dict, messages)."""
        c = cmd.get("cmd")
        with self.lock:
            if c == "reset":
                return dict(ok=True), self.reset()
            if c == "structure":
                if self.mapper.voxels is None:
                    return dict(ok=False, reason="no model yet"), []
                st = self._analyse()
                return dict(ok=True), [("json", json.dumps(dict(type="structure", **st)))]
            if c == "scale":
                ok = self.mapper.apply_scale(float(cmd["factor"]), "manual")
                return dict(ok=ok), self._after_transform()
            if c == "scale_known":   # a measured distance in the model (map units) == meters
                ok = self.mapper.apply_scale(float(cmd["meters"]) / float(cmd["model_units"]), "manual")
                return dict(ok=ok), self._after_transform()
            if c == "mark_height":
                r = self.mapper.mark_height(float(cmd["meters"]))
                return r, (self._after_transform() if r.get("factor") else [])
            if c == "scale_door":
                if self.mapper.voxels is None:
                    return dict(ok=False, reason="no model yet"), []
                st = self._analyse()
                doors = [o["height"] for o in st["openings"] if o["kind"] == "door"]
                if not doors:
                    return dict(ok=False, reason="no door detected yet"), []
                f = STANDARD_DOOR_HEIGHT_M / float(np.median(doors))
                ok = self.mapper.apply_scale(f, "door")
                return dict(ok=ok, factor=round(f, 4)), self._after_transform()
            if c == "calibrate_start":
                pat = tuple(cmd.get("pattern", (9, 6)))
                self.calibrator = Calibrator(pat)
                return dict(ok=True), [("json", json.dumps(dict(type="calibration", views=0, needed=12)))]
            if c == "calibrate_finish":
                return self._calibration_finish()
            if c == "calibrate_cancel":
                self.calibrator = None
                return dict(ok=True), []
            if c == "finish":
                return dict(ok=True, session_dir=self.finish()), []
            if c == "state":
                st = self.mapper.stats()
                st.update(processed=self.processed, state=self.mapper.state, session_dir=self.rec_dir,
                          calibrated=bool(self.mapper.prep.calib), calibrating=self.calibrator is not None)
                return st, []
        return dict(ok=False, reason=f"unknown command {c}"), []

    def _after_transform(self):
        if self.mapper.voxels is not None:
            self._analyse()
        return self.snapshot()

    # --------------------------------------------------------- calibration
    def _calibration_step(self, img, tm):
        crop = tm.get("crop", self.mapper.cfg.get("crop"))
        if crop:                       # calibrate on exactly the image region the mapper will use
            h, w = img.shape[:2]
            l, t, r, b = crop
            img = img[int(round(t * h)):int(round(h - b * h)), int(round(l * w)):int(round(w - r * w))]
        info = self.calibrator.add(img)
        return [("json", json.dumps(dict(type="calibration", **info)))]

    def _calibration_finish(self):
        try:
            calib = self.calibrator.solve()
        except ValueError as e:
            return dict(ok=False, reason=str(e)), []
        self.calibrator = None
        if self.calib_path:
            save_calibration(self.calib_path, calib)
        self.mapper_cfg["calib"] = calib
        msgs = self.reset()
        self.mapper.prep.set_calibration(calib)
        info = dict(ok=True, model=calib["model"], rms=round(calib["rms"], 3), views=calib["views"])
        return info, msgs + [("json", json.dumps(dict(type="calibration", done=True, **info)))]

    # -------------------------------------------------------------- export
    def export_ply_bytes(self):
        with self.lock:
            if self.mapper.voxels is None:
                xyz, rgb = np.zeros((0, 3)), np.zeros((0, 3))
            else:
                xyz, rgb = self.mapper.voxels.points()
        b = io.BytesIO()
        write_ply(b, xyz, rgb)
        return b.getvalue()

    def finish(self):
        """Write model.ply, structure.json, transforms.json into the session folder."""
        if not self.rec_dir:
            return None
        with self.lock:
            m = self.mapper
            if m.voxels is not None:
                xyz, rgb = m.voxels.points()
                write_ply(os.path.join(self.rec_dir, "model.ply"), xyz, rgb)
                st = self._analyse()
                with open(os.path.join(self.rec_dir, "structure.json"), "w") as f:
                    json.dump(st, f, indent=1)
            if m.K is not None and self.rec_frames:
                frames = [(n, np.array(R), np.array(C)) for n, R, C in self.rec_frames]
                write_transforms(os.path.join(self.rec_dir, "transforms.json"), m.K, m.size, frames)
            self.rec_file.flush()
        return self.rec_dir


def messages_to_json(msgs):
    """For bridges that can only pass strings (Android WebView): binary -> base64."""
    out = []
    for kind, data in msgs:
        if kind == "bin":
            out.append({"type": "points_b64", "data": base64.b64encode(data).decode()})
        else:
            out.append(json.loads(data))
    return json.dumps(out)
