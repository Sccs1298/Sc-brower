"""Entry points called from the Android app through Chaquopy (everything runs on the phone).

Kotlin side:
    val m = Python.getInstance().getModule("drone3d.mobile")
    m.callAttr("init", filesDir, configJson)
    m.callAttr("process_rgba", bytes, width, height, rowStride, telemetryJson)   // worker thread
    m.callAttr("poll", 50).toString()          // WebView bridge: JSON array of messages
    m.callAttr("command", "{\"cmd\": \"mark_height\", \"meters\": 3.5}").toString()
"""
import collections
import json
import os
import threading
import traceback

from .engine import Engine, messages_to_json

# phone-friendly defaults: smaller frames, fewer features
MOBILE_CFG = dict(max_width=640, n_features=1500, dense_stride=4, ba_window=6, auto_overlay_mask=True)

_engine = None
_queue = collections.deque(maxlen=4000)
_lock = threading.Lock()
_files = None


def init(files_dir, config_json="{}"):
    global _engine, _files
    cfg = dict(MOBILE_CFG)
    cfg.update(json.loads(config_json or "{}"))
    _files = str(files_dir)
    sessions = os.path.join(_files, "sessions")
    os.makedirs(sessions, exist_ok=True)
    _engine = Engine(cfg, record_root=sessions if cfg.pop("record", True) else None,
                     calib_path=os.path.join(_files, "calibration.json"))
    _queue.clear()
    _push(_engine.snapshot())
    return json.dumps(dict(ok=True, calibrated=bool(_engine.mapper.prep.calib)))


def _push(msgs):
    with _lock:
        for m in msgs:
            if m[0] == "json" and '"type": "reset"' in m[1]:
                _queue.clear()       # viewer is going to rebuild from scratch anyway
            _queue.append(m)


def process_rgba(buf, width, height, row_stride, tm_json="{}"):
    try:
        msgs = _engine.process_rgba(bytes(buf), int(width), int(height), int(row_stride), json.loads(tm_json))
        _push(msgs)
        return len(msgs)
    except Exception:
        traceback.print_exc()
        return -1


def process_jpeg(buf, tm_json="{}"):
    msgs = _engine.process_jpeg(bytes(buf), json.loads(tm_json))
    _push(msgs)
    return len(msgs)


def poll(max_messages=50):
    out = []
    with _lock:
        while _queue and len(out) < int(max_messages):
            out.append(_queue.popleft())
    return messages_to_json(out)


def command(cmd_json):
    try:
        reply, msgs = _engine.command(json.loads(cmd_json))
    except Exception as e:
        traceback.print_exc()
        return json.dumps(dict(ok=False, reason=str(e)))
    _push(msgs)
    return json.dumps(reply)


def snapshot():
    _push(_engine.snapshot())
    return "ok"


def export_ply(path):
    data = _engine.export_ply_bytes()
    with open(str(path), "wb") as f:
        f.write(data)
    return str(path)
