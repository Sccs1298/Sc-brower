import os
import sys

import numpy as np
import pytest

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "tools"))

from drone3d.geo import (attitude_from_cam_rotation, cam_rotation_from_attitude, enu_to_gps,  # noqa: E402
                         gps_to_enu, rotation_angle_deg)
from drone3d.protocol import decode_frame, encode_frame, encode_points  # noqa: E402
from drone3d.structure import analyse  # noqa: E402
from drone3d.voxelmap import VoxelMap  # noqa: E402


def test_attitude_conventions():
    # gimbal level, heading north -> camera looks north (+y ENU), image "down" is -z
    R = cam_rotation_from_attitude(0, 0, 0)
    assert np.allclose(R[:, 2], [0, 1, 0])
    assert np.allclose(R[:, 1], [0, 0, -1])
    # heading east
    assert np.allclose(cam_rotation_from_attitude(90, 0, 0)[:, 2], [1, 0, 0], atol=1e-9)
    # gimbal pitched -90 -> looking straight down
    assert np.allclose(cam_rotation_from_attitude(0, -90, 0)[:, 2], [0, 0, -1], atol=1e-9)
    for yaw, pitch, roll in [(10, -30, 2), (-120, -5, -1), (179, -80, 0.5)]:
        R = cam_rotation_from_attitude(yaw, pitch, roll)
        assert rotation_angle_deg(R, cam_rotation_from_attitude(*attitude_from_cam_rotation(R))) < 1e-6


def test_gps_roundtrip():
    lat0, lon0 = 32.08, 34.78
    p = np.array([12.5, -40.0, 3.0])
    lat, lon, alt = enu_to_gps(p, lat0, lon0, 0)
    assert np.allclose(gps_to_enu(lat, lon, alt, lat0, lon0, 0), p, atol=1e-3)


def test_protocol_roundtrip():
    tm = dict(t=123, gimbal=[-10, 0, 45], lat=1.0)
    buf = encode_frame(tm, b"\xff\xd8jpeg")
    tm2, jpg = decode_frame(buf)
    assert tm2 == tm and jpg == b"\xff\xd8jpeg"
    pts = encode_points(np.zeros((3, 3)), np.zeros((3, 3)))
    assert pts[:4] == b"PTS1" and len(pts) == 8 + 3 * 12 + 3 * 3


def test_voxel_needs_two_independent_views():
    vm = VoxelMap(base_size=0.05, min_obs=2)
    X = np.random.default_rng(0).random((500, 3)) * 0.04
    rgb = np.full((500, 3), 200, np.uint8)
    a, _ = vm.insert(X, rgb, np.full(500, 2.0))
    assert len(a) == 0                     # one view pair: not confirmed, however many points
    b, _ = vm.insert(X + 0.001, rgb, np.full(500, 2.0))
    assert len(b) >= 1 and len(vm) >= 1


def _box_points(rng, n=4000):
    """Facade y=0 (10 x 6 m) with two window holes, plus ground."""
    pts = []
    while len(pts) < n:
        x, z = rng.uniform(0, 10), rng.uniform(0, 6)
        if (2 < x < 4 and 3.5 < z < 4.7) or (6 < x < 8 and 3.5 < z < 4.7):
            continue
        pts.append((x, rng.normal(0, 0.01), z))
    g = np.c_[rng.uniform(-5, 15, n), rng.uniform(-10, 0, n), rng.normal(0, 0.01, n)]
    return np.vstack([np.array(pts), g])


def test_structure_finds_facade_windows_and_ground():
    rep = analyse(_box_points(np.random.default_rng(1)), gravity=True)
    kinds = [p["kind"] for p in rep["planes"]]
    assert "vertical" in kinds and "horizontal" in kinds
    assert abs(rep["ground_z"]) < 0.1
    wins = [o for o in rep["openings"] if o["kind"] == "window"]
    assert len(wins) == 2
    for w in wins:
        assert 1.5 < w["width"] < 2.6 and 0.8 < w["height"] < 1.7
    assert rep["storeys"]["building_height_m"] == pytest.approx(6.0, abs=0.4)
    assert rep["storeys"]["estimate"] == 2


@pytest.mark.slow
def test_pipeline_on_short_synthetic_flight(tmp_path):
    import json
    import subprocess

    import cv2
    from drone3d.slam import Mapper
    from evaluate import umeyama

    out = tmp_path / "syn"
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "synth.py"), str(out), "--frames", "60",
                    "--width", "480"], check=True, capture_output=True)
    lines = [json.loads(l) for l in open(out / "telemetry.jsonl")]
    gt = {g["frame"]: np.array(g["C"]) for g in json.load(open(out / "groundtruth.json"))["gt"]}
    m = Mapper()
    est = {}
    for tm in lines[:40]:  # outdoor part
        r = m.process(cv2.imread(str(out / "frames" / tm["frame"])), tm)
        if r["pose"] is not None:
            est[tm["frame"]] = r["pose"][1]
    assert len(est) >= 30 and m.metric
    E = np.array(list(est.values()))
    G = np.array([gt[k] for k in est])
    s, R, t = umeyama(E, G)
    err = np.linalg.norm(s * E @ R.T + t - G, axis=1)
    assert abs(s - 1) < 0.1                 # metric scale from DJI telemetry
    assert np.median(err) < 0.3
    assert len(m.voxels) > 1000
