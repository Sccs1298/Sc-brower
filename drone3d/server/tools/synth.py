"""Synthetic drone flight: outside a two-storey house, through the door, inside.

Renders frames by ray-casting textured rectangles and emits DJI-like telemetry
(GPS outside, no GPS + velocity inside, gimbal attitude with noise), so the
whole server pipeline can be tested without a drone.

  python tools/synth.py out_dir [--frames 140] [--width 640]
"""
import argparse
import json
import math
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from drone3d.geo import attitude_from_cam_rotation, enu_to_gps, intrinsics  # noqa: E402

LAT0, LON0 = 32.0853, 34.7818


def make_texture(seed, tint, size=1024):
    rng = np.random.default_rng(seed)
    acc = np.zeros((size, size), np.float32)
    for k, amp in zip((8, 16, 32, 64, 128, 256, 512), (1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4)):
        small = rng.random((k, k)).astype(np.float32)
        acc += amp * cv2.resize(small, (size, size), interpolation=cv2.INTER_CUBIC)
    acc = (acc - acc.min()) / (acc.max() - acc.min())
    img = np.stack([acc * t for t in tint], -1)
    img = (40 + 200 * img).clip(0, 255).astype(np.uint8)
    return [img] + [cv2.resize(img, (size >> l, size >> l), interpolation=cv2.INTER_AREA) for l in range(1, 7)]


def sample(img, x, y, border=cv2.BORDER_REPLICATE):
    """Bilinear lookup of img at float coords (any number of points)."""
    n = len(x)
    cols = 1024
    rows = (n + cols - 1) // cols
    mx = np.zeros(rows * cols, np.float32)
    my = np.zeros(rows * cols, np.float32)
    mx[:n], my[:n] = x, y
    out = cv2.remap(img, mx.reshape(rows, cols), my.reshape(rows, cols), cv2.INTER_LINEAR, borderMode=border)
    return out.reshape(rows * cols, *img.shape[2:])[:n]


def rect(o, u, v, su, sv, front, back=None, windows=()):
    return dict(o=np.array(o, float), u=np.array(u, float), v=np.array(v, float), su=su, sv=sv,
                front=front, back=front if back is None else back, windows=list(windows))


def build_scene():
    """House: x 0..10, y 0..8, z 0..6.5. Front facade (y=0) faces the drone start."""
    E, N, U = (1, 0, 0), (0, 1, 0), (0, 0, 1)
    win_g = [(1, 1, 2, 1.2), (7, 1, 2, 1.2)]                # (a, b, w, h) on facade
    win_1 = [(1, 4, 2, 1.2), (4, 4, 2, 1.2), (7, 4, 2, 1.2)]
    R = []
    # ground around the house (4 pieces so nothing is coplanar with the inside floor)
    R += [rect((-40, -40, 0), E, N, 90, 40, 0), rect((-40, 8, 0), E, N, 90, 40, 0),
          rect((-40, 0, 0), E, N, 40, 8, 0), rect((10, 0, 0), E, N, 40, 8, 0)]
    # front facade with a door gap x 4..6, z 0..2.2
    R += [rect((0, 0, 0), E, U, 4, 6.5, 1, 4, [w for w in win_g if w[0] < 4] + [w for w in win_1 if w[0] < 4]),
          rect((6, 0, 0), E, U, 4, 6.5, 1, 4, [(w[0] - 6, *w[1:]) for w in win_g + win_1 if w[0] >= 6]),
          rect((4, 0, 2.2), E, U, 2, 4.3, 1, 4, [(0, 1.8, 2, 1.2)])]
    # back and side walls
    R += [rect((0, 8, 0), E, U, 10, 6.5, 1, 5, [(w[0], w[1], w[2], w[3]) for w in win_1]),
          rect((0, 0, 0), N, U, 8, 6.5, 2, 6, [(3, 1, 2, 1.2), (3, 4, 2, 1.2)]),
          rect((10, 0, 0), N, U, 8, 6.5, 2, 6, [(3, 4, 2, 1.2)])]
    # roof, inside floor, ceiling of ground floor
    R += [rect((0, 0, 6.5), E, N, 10, 8, 3), rect((0, 0, 0), E, N, 10, 8, 7), rect((0, 0, 3), E, N, 10, 8, 8)]
    # a cabinet inside
    R += [rect((7, 5, 0), E, U, 1.5, 1.0, 9), rect((7, 6, 0), E, U, 1.5, 1.0, 9),
          rect((7, 5, 0), N, U, 1, 1.0, 9), rect((8.5, 5, 0), N, U, 1, 1.0, 9), rect((7, 5, 1), E, N, 1.5, 1, 9)]
    return R


TINTS = [(0.55, 0.75, 0.6), (0.85, 0.8, 0.75), (0.8, 0.75, 0.7), (0.6, 0.45, 0.4), (0.9, 0.85, 0.7),
         (0.75, 0.85, 0.9), (0.8, 0.9, 0.75), (0.7, 0.55, 0.35), (0.95, 0.95, 0.9), (0.5, 0.4, 0.6)]


class Renderer:
    def __init__(self, scene, K, w, h):
        self.scene, self.K, self.w, self.h = scene, K, w, h
        self.tex = [make_texture(100 + i, t) for i, t in enumerate(TINTS)]
        self.ppm = 120.0  # texels per metre at level 0

    def render(self, R_wc, C):
        w, h, K = self.w, self.h, self.K
        u, v = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
        rc = np.stack([(u - K[0, 2]) / K[0, 0], (v - K[1, 2]) / K[1, 1], np.ones_like(u)], -1).reshape(-1, 3)
        d = rc @ R_wc.T
        n_pix = len(d)
        best = np.full(n_pix, np.inf)
        out = np.zeros((n_pix, 3), np.uint8)
        out[:] = (235, 206, 160)  # sky (BGR)
        sky_grad = (d[:, 2].clip(0, 1) * 40).astype(np.uint8)
        out[:, 2] = (out[:, 2].astype(int) - sky_grad).clip(0, 255)
        info = []
        for i, r in enumerate(self.scene):
            un = r["u"] / np.linalg.norm(r["u"])
            vn = r["v"] / np.linalg.norm(r["v"])
            nrm = np.cross(un, vn)
            den = d @ nrm
            with np.errstate(divide="ignore", invalid="ignore"):
                t = ((r["o"] - C) @ nrm) / den
            P = C + t[:, None] * d
            a = (P - r["o"]) @ un
            b = (P - r["o"]) @ vn
            hit = (t > 0.05) & (t < best) & (a >= 0) & (a <= r["su"]) & (b >= 0) & (b <= r["sv"])
            if not hit.any():
                continue
            best[hit] = t[hit]
            info.append((i, hit, a, b, den, t))
        # resolve winners
        for i, hit, a, b, den, t in info:
            win = hit & (t == best)
            r = self.scene[i]
            idx = np.where(win)[0]
            if len(idx) == 0:
                continue
            tex_id = np.where(den[idx] < 0, r["front"], r["back"])
            # footprint -> mip level
            foot = best[idx] / K[0, 0] / np.maximum(np.abs(den[idx]), 0.2)
            lvl = np.clip(np.floor(np.log2(np.maximum(foot * self.ppm, 1.0))), 0, 6).astype(int)
            aa, bb = a[idx], b[idx]
            col = np.zeros((len(idx), 3), np.uint8)
            for tid in np.unique(tex_id):
                for L in np.unique(lvl):
                    s = (tex_id == tid) & (lvl == L)
                    if not s.any():
                        continue
                    T = self.tex[tid][L]
                    sz = T.shape[0]
                    sc = self.ppm / (1 << L)
                    off = 37.0 * i
                    mx = ((aa[s] + off) * sc) % sz
                    my = ((bb[s] + 0.5 * off) * sc) % sz
                    col[s] = sample(T, mx, my, cv2.BORDER_WRAP)
            for (wa, wb, ww, wh) in r["windows"]:
                s = (aa >= wa) & (aa <= wa + ww) & (bb >= wb) & (bb <= wb + wh)
                col[s] = (70, 62, 55)  # dark, textureless glass
            out[idx] = col
        img = out.reshape(h, w, 3)
        return img, best.reshape(h, w)


def look_at(C, target):
    f = np.asarray(target, float) - C
    f /= np.linalg.norm(f)
    r = np.cross(f, [0, 0, 1.0])
    r /= np.linalg.norm(r)
    dn = np.cross(f, r)
    return np.stack([r, dn, f], 1)


def trajectory(n):
    """Outside arc -> approach door -> enter -> scan the room."""
    n_a, n_b = int(n * 0.3), int(n * 0.25)
    n_c = n - n_a - n_b
    poses = []
    ctr = np.array([5.0, 4.0, 3.0])
    for i in range(n_a):  # arc in front of the house
        ang = math.radians(-125 + 70 * i / max(n_a - 1, 1))
        C = np.array([5 + 16 * math.cos(ang), 4 + 16 * math.sin(ang), 5.0 - 2.0 * i / n_a])
        poses.append((look_at(C, ctr), C, True))
    last = poses[-1][1]
    door = np.array([5.0, -1.5, 1.2])
    for i in range(1, n_b + 1):  # approach the door, turning to look through it
        s = i / n_b
        C = last + (door - last) * s
        tgt = np.array([5.0, 8.0, 1.2]) * min(1, 2 * s) + ctr * (1 - min(1, 2 * s))
        poses.append((look_at(C, tgt), C, True))
    for i in range(n_c):  # through the door, then turn left and right
        s = i / max(n_c - 1, 1)
        y = -1.5 + 5.0 * min(1, 1.6 * s)
        C = np.array([5.0, y, 1.2 + 0.2 * s])
        yaw = math.radians(55 * math.sin(2 * math.pi * max(0, s - 0.3) / 0.7))
        tgt = C + np.array([math.sin(yaw), math.cos(yaw), -0.08])
        inside = y > 0.3
        poses.append((look_at(C, tgt), C, not inside))
    return poses


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--frames", type=int, default=140)
    ap.add_argument("--width", type=int, default=640)
    ap.add_argument("--hfov", type=float, default=73.7)
    ap.add_argument("--fps", type=float, default=4.0)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    rng = np.random.default_rng(a.seed)
    w, h = a.width, a.width * 9 // 16
    K = intrinsics(w, h, a.hfov)
    scene = build_scene()
    rend = Renderer(scene, K, w, h)
    os.makedirs(os.path.join(a.out, "frames"), exist_ok=True)
    poses = trajectory(a.frames)
    gt = []
    prevC = None
    bias = np.array([rng.normal(0, 1.5), rng.normal(0, 0.3), rng.normal(0, 0.3)])
    with open(os.path.join(a.out, "telemetry.jsonl"), "w") as f:
        for i, (R, C, gps) in enumerate(poses):
            img, _ = rend.render(R, C)
            img = np.clip(img.astype(np.int16) + rng.normal(0, 2, img.shape).astype(np.int16), 0, 255).astype(np.uint8)
            name = f"{i:06d}.jpg"
            cv2.imwrite(os.path.join(a.out, "frames", name), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
            t_ms = int(i * 1000 / a.fps)
            yaw, pitch, roll = attitude_from_cam_rotation(R)
            # gimbal attitude: slowly drifting bias (compass / IMU) + small white noise
            bias += rng.normal(0, [0.03, 0.01, 0.01])
            yaw += bias[0] + rng.normal(0, 0.05)
            pitch += bias[1] + rng.normal(0, 0.05)
            roll += bias[2] + rng.normal(0, 0.05)
            vel = [0, 0, 0] if prevC is None else list((C - prevC) * a.fps)
            tm = dict(t=t_ms, w=w, h=h, hfov=a.hfov, alt=float(C[2] + rng.normal(0, 0.05)),
                      gimbal=[pitch, roll, yaw], att=[0.0, 0.0, yaw],
                      vel=[vel[1] + rng.normal(0, 0.05), vel[0] + rng.normal(0, 0.05), -vel[2]])
            if gps:
                lat, lon, _ = enu_to_gps(C + rng.normal(0, 0.3, 3), LAT0, LON0, 0)
                tm.update(lat=lat, lon=lon, gps_level=4)
            else:
                tm.update(lat=0.0, lon=0.0, gps_level=0)
            f.write(json.dumps(dict(frame=name, **tm)) + "\n")
            gt.append(dict(frame=name, R_wc=R.tolist(), C=C.tolist(), inside=not gps))
            prevC = C
    scene_json = [dict(o=r["o"].tolist(), u=r["u"].tolist(), v=r["v"].tolist(), su=r["su"], sv=r["sv"],
                       windows=r["windows"]) for r in scene]
    json.dump(dict(gt=gt, scene=scene_json, origin_offset=poses[0][1].tolist()),
              open(os.path.join(a.out, "groundtruth.json"), "w"))
    print(f"wrote {len(poses)} frames to {a.out}")


if __name__ == "__main__":
    main()
