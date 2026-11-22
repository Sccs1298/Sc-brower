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


# ---------------------------------------------------------------- DJI Avata / screen-capture mode
def test_calibrator_recovers_lens_distortion(tmp_path):
    import cv2
    from drone3d.geo import intrinsics
    from drone3d.screen import Calibrator
    from synth import Distorter, render_chessboard_views

    K = intrinsics(640, 360, 95)
    dist = Distorter(K, [-0.28, 0.07, 0, 0, 0], 640, 360)
    render_chessboard_views(str(tmp_path), dist.K_big, dist.big, dist, 18, np.random.default_rng(3))
    cal = Calibrator((9, 6))
    for fn in sorted(os.listdir(tmp_path)):
        cal.add(cv2.imread(str(tmp_path / fn)))
    c = cal.solve()
    assert c["rms"] < 1.0
    assert c["K"][0][0] == pytest.approx(K[0, 0], rel=0.03)
    assert c["dist"][0] == pytest.approx(-0.28, abs=0.03)


def test_overlay_detector_masks_static_osd():
    import cv2
    from drone3d.screen import FramePrep

    rng = np.random.default_rng(0)
    world = cv2.GaussianBlur((rng.random((800, 1400)) * 255).astype(np.uint8), (0, 0), 2)
    prep = FramePrep(dict(auto_overlay_mask=True))
    for i in range(30):
        frame = cv2.cvtColor(world[100:460, 20 * i:20 * i + 640].copy(), cv2.COLOR_GRAY2BGR)
        cv2.putText(frame, f"H {i * 0.1:.1f}m", (10, 340), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        cv2.rectangle(frame, (580, 40), (620, 200), (255, 255, 255), 2)
        _, mask, _ = prep(frame, {})
    assert prep.ready
    assert (mask[45:195, 577:584] == 0).mean() > 0.8        # outline of the static gauge masked
    assert (mask[100:260, 200:440] > 0).mean() > 0.9        # moving scene kept


def test_mobile_bridge_roundtrip(tmp_path):
    import json
    from drone3d import mobile

    mobile.init(str(tmp_path), json.dumps({"record": True}))
    rng = np.random.default_rng(1)
    w, h, stride = 320, 180, 320 * 4 + 64          # Android rows are padded
    buf = rng.integers(0, 255, h * stride, dtype=np.uint8).tobytes()
    assert mobile.process_rgba(buf, w, h, stride, json.dumps({"t": 0})) >= 1
    msgs = json.loads(mobile.poll(100))
    assert any(m["type"] == "pose" for m in msgs)
    assert json.loads(mobile.command('{"cmd": "state"}'))["processed"] == 1
    assert json.loads(mobile.command('{"cmd": "mark_height", "meters": 2}'))["ok"] is False   # not tracking
    assert json.loads(mobile.command('{"cmd": "reset"}'))["ok"] is True
    assert os.path.exists(mobile.export_ply(str(tmp_path / "m.ply")))


@pytest.mark.slow
def test_avata_flight_without_telemetry(tmp_path):
    """Screen capture of DJI Fly: OSD overlay + barrel distortion + no telemetry.
    Lens from chessboard views, gravity from the level horizon, metric scale from the
    on-screen height H (as read by the app's OCR, 0.1 m resolution)."""
    import json
    import subprocess

    import cv2
    from drone3d.screen import Calibrator
    from drone3d.slam import Mapper
    from evaluate import umeyama

    out = tmp_path / "av"
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "synth.py"), str(out), "--frames", "60",
                    "--takeoff", "50", "--width", "480", "--hud", "--distort=-0.28,0.07", "--hfov", "95",
                    "--chessboard", "18"], check=True, capture_output=True)
    cal = Calibrator((9, 6))
    for fn in sorted(os.listdir(out / "calib")):
        cal.add(cv2.imread(str(out / "calib" / fn)))
    m = Mapper(auto_overlay_mask=True, calib=cal.solve())
    gt = {g["frame"]: g for g in json.load(open(out / "groundtruth.json"))["gt"]}
    lines = [json.loads(l) for l in open(out / "telemetry.jsonl")]
    kf_frame = []
    for tm in lines:
        H = round(gt[tm["frame"]]["C"][2], 1)
        m.process(cv2.imread(str(out / "frames" / tm["frame"])), {"alt_osd": H})
        if len(m.kfs) and (not kf_frame or kf_frame[-1][0] is not m.kfs[-1]):
            kf_frame.append((m.kfs[-1], tm["frame"]))
    assert m.gravity_aligned and m.metric and m.scale_source == "osd_height"
    E = np.array([k.C for k, _ in kf_frame])
    G = np.array([gt[f]["C"] for _, f in kf_frame])
    s, R, t = umeyama(E, G)
    assert abs(s - 1) < 0.2
    tilt = np.degrees(np.arccos(np.clip((R @ [0, 0, 1.0])[2], -1, 1)))
    assert tilt < 4
    assert np.median(np.linalg.norm(s * E @ R.T + t - G, axis=1)) < 0.4


def test_height_marks_need_vertical_motion():
    from drone3d.slam import Mapper, Keyframe

    m = Mapper()
    kf = Keyframe(0, None, None, np.zeros((1, 2)), np.zeros((1, 32), np.uint8), np.eye(3), np.zeros(3))
    kf.median_depth = 1.0
    m.kfs, m.state, m.gravity_aligned = [kf], "tracking", True
    m.last_pose = (np.eye(3), np.array([0.0, 0.0, 0.0]))
    assert m.mark_height(1.0)["marks"] == 1
    m.last_pose = (np.eye(3), np.array([3.0, 0.0, 0.5]))         # flew sideways
    assert m.mark_height(2.5)["ok"] is False
    m.last_pose = (np.eye(3), np.array([0.0, 0.0, 0.0]))         # start again, then climb straight up
    assert m.mark_height(1.0)["marks"] == 1
    m.last_pose = (np.eye(3), np.array([0.05, 0.0, 0.75]))       # straight climb: 1.5 m == 0.75 units
    r = m.mark_height(2.5)
    assert r["ok"] and r["factor"] == pytest.approx(2.0, rel=0.01)


# ------------------------------------------------- iPhone: AirPlay mirroring grabbed on the computer
def test_parse_height_formats():
    from drone3d.capture import parse_height
    assert parse_height("< N  In Flight\nH 12.3m   D 40m") == pytest.approx(12.3)
    assert parse_height("ALT: 3,5 m") == pytest.approx(3.5)
    assert parse_height("H 40 ft") == pytest.approx(12.192)
    assert parse_height("HDR 4K  D 10m") is None


def test_letterbox_crop_finds_mirrored_picture():
    from drone3d.capture import LetterboxCropper
    screen = np.zeros((800, 1280, 3), np.uint8)
    screen[130:670, :] = np.random.default_rng(0).integers(30, 255, (540, 1280, 3))   # 16:9 picture
    out = LetterboxCropper()(screen)
    assert abs(out.shape[0] - 540) <= 8 and out.shape[1] == 1280


@pytest.mark.skipif(not __import__("shutil").which("tesseract"), reason="tesseract not installed")
def test_ocr_reads_dji_fly_height():
    import cv2
    pytesseract = pytest.importorskip("pytesseract")
    from drone3d.capture import HeightOCR
    from synth import draw_hud
    rng = np.random.default_rng(2)
    img = cv2.GaussianBlur(rng.integers(0, 255, (360, 640, 3), dtype=np.uint8), (0, 0), 3)
    img = cv2.resize(draw_hud(img, 3, np.array([5.0, 9.0, 7.4])), (1280, 720))
    reader = HeightOCR.__new__(HeightOCR)
    assert reader.read(img, pytesseract) == pytest.approx(7.4)
