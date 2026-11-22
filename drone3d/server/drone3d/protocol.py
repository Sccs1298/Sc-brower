"""Wire format between the phone app and the server.

Phone -> server (binary WebSocket message):
    b"D3D1" | uint32 LE json_len | json (UTF-8 telemetry) | JPEG bytes

Server -> viewer:
    text  : JSON {"type": "pose"|"stats"|"structure"|"reset"|"snapshot_done", ...}
    binary: b"PTS1" | uint32 LE n | float32[3n] xyz (ENU) | uint8[3n] rgb
"""
import json
import struct

import numpy as np

MAGIC_FRAME = b"D3D1"
MAGIC_POINTS = b"PTS1"


def encode_frame(telemetry: dict, jpeg: bytes) -> bytes:
    js = json.dumps(telemetry).encode()
    return MAGIC_FRAME + struct.pack("<I", len(js)) + js + jpeg


def decode_frame(buf: bytes):
    if buf[:4] != MAGIC_FRAME:
        raise ValueError("bad magic")
    (n,) = struct.unpack("<I", buf[4:8])
    tm = json.loads(buf[8:8 + n].decode())
    return tm, buf[8 + n:]


def encode_points(xyz, rgb) -> bytes:
    xyz = np.ascontiguousarray(xyz, np.float32)
    rgb = np.ascontiguousarray(rgb, np.uint8)
    return MAGIC_POINTS + struct.pack("<I", len(xyz)) + xyz.tobytes() + rgb.tobytes()
