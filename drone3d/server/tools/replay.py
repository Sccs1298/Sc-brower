"""Replays a recorded / synthetic flight into a running server, like the phone would.

  python tools/replay.py DATASET_DIR [--url ws://localhost:8080/ws/drone] [--fps 4]
"""
import argparse
import asyncio
import json
import os
import sys
import time

import aiohttp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from drone3d.protocol import encode_frame  # noqa: E402


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset")
    ap.add_argument("--url", default="ws://localhost:8080/ws/drone")
    ap.add_argument("--fps", type=float, default=4.0)
    ap.add_argument("--no-telemetry", action="store_true")
    ap.add_argument("--osd-height", action="store_true",
                    help="send only the on-screen height H (from groundtruth.json), like the Avata app's OCR")
    a = ap.parse_args()
    lines = [json.loads(l) for l in open(os.path.join(a.dataset, "telemetry.jsonl"))]
    gt = {}
    if a.osd_height:
        gt = {g["frame"]: g["C"][2] for g in json.load(open(os.path.join(a.dataset, "groundtruth.json")))["gt"]}
    async with aiohttp.ClientSession() as s:
        async with s.ws_connect(a.url, max_msg_size=0) as ws:
            t0 = time.time()
            for i, tm in enumerate(lines):
                jpg = open(os.path.join(a.dataset, "frames", tm["frame"]), "rb").read()
                frame = tm["frame"]
                tm = {k: v for k, v in tm.items() if k != "frame"}
                if a.no_telemetry or a.osd_height:
                    tm = dict(t=tm.get("t"), hfov=tm.get("hfov"))
                if a.osd_height:
                    tm["alt_osd"] = round(gt[frame], 1)
                await ws.send_bytes(encode_frame(tm, jpg))
                wait = t0 + (i + 1) / a.fps - time.time()
                if wait > 0:
                    await asyncio.sleep(wait)
            await ws.send_str(json.dumps(dict(cmd="status")))
            msg = await ws.receive(timeout=30)
            print("server:", msg.data)


if __name__ == "__main__":
    asyncio.run(main())
