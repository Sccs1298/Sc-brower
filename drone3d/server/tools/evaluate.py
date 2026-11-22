"""Run the mapper offline on a recorded/synthetic dataset and score it.

  python tools/evaluate.py DATASET_DIR [--out model.ply] [--no-telemetry]

With groundtruth.json present (synthetic data) it reports trajectory error and
the distance of every reconstructed point to the true surfaces.
"""
import argparse
import json
import os
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from drone3d.slam import Mapper  # noqa: E402
from drone3d.structure import analyse  # noqa: E402
from drone3d.export import write_ply  # noqa: E402


def umeyama(src, dst, scale=True):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    s0, d0 = src - mu_s, dst - mu_d
    U, S, Vt = np.linalg.svd(d0.T @ s0 / len(src))
    D = np.eye(3)
    if np.linalg.det(U @ Vt) < 0:
        D[2, 2] = -1
    R = U @ D @ Vt
    c = np.trace(np.diag(S) @ D) / s0.var(0).sum() if scale else 1.0
    t = mu_d - c * R @ mu_s
    return c, R, t


def surface_distance(P, scene):
    best = np.full(len(P), np.inf)
    for r in scene:
        o, u, v = (np.array(r[k]) for k in ("o", "u", "v"))
        a = np.clip((P - o) @ u, 0, r["su"])
        b = np.clip((P - o) @ v, 0, r["sv"])
        Q = o + a[:, None] * u + b[:, None] * v
        best = np.minimum(best, np.linalg.norm(P - Q, axis=1))
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dataset")
    ap.add_argument("--out")
    ap.add_argument("--no-telemetry", action="store_true")
    a = ap.parse_args()

    lines = [json.loads(l) for l in open(os.path.join(a.dataset, "telemetry.jsonl"))]
    gt = None
    gpath = os.path.join(a.dataset, "groundtruth.json")
    if os.path.exists(gpath):
        gt = json.load(open(gpath))
    m = Mapper()
    est = {}
    t0 = time.time()
    states = {}
    for tm in lines:
        img = cv2.imread(os.path.join(a.dataset, "frames", tm["frame"]))
        r = m.process(img, None if a.no_telemetry else tm)
        states[r["state"]] = states.get(r["state"], 0) + 1
        if r["pose"] is not None:
            est[tm["frame"]] = r["pose"][1]
    dt = time.time() - t0
    xyz, rgb = m.voxels.points() if m.voxels else (np.zeros((0, 3)), np.zeros((0, 3)))
    print(f"frames={len(lines)} time={dt:.1f}s ({1000 * dt / len(lines):.0f} ms/frame) states={states}")
    print("stats:", m.stats())

    if gt:
        gtC = {g["frame"]: np.array(g["C"]) for g in gt["gt"]}
        names = [n for n in est if n in gtC]
        E = np.array([est[n] for n in names])
        G = np.array([gtC[n] for n in names])
        # raw: map is in ENU relative to the first GPS fix
        off = G[0] - E[0]
        raw = np.linalg.norm(E + off - G, axis=1)
        c, R, t = umeyama(E, G, scale=True)
        al = np.linalg.norm((c * E @ R.T + t) - G, axis=1)
        print(f"trajectory: {len(names)} tracked poses | raw(ENU, shifted) median {np.median(raw):.3f} m "
              f"max {raw.max():.3f} | aligned(sim3) median {np.median(al):.3f} max {al.max():.3f} scale={c:.3f}")
        P = c * xyz.astype(np.float64) @ R.T + t
        d = surface_distance(P, gt["scene"])
        inside = (P[:, 0] > 0.2) & (P[:, 0] < 9.8) & (P[:, 1] > 0.2) & (P[:, 1] < 7.8) & (P[:, 2] < 2.9)
        for name, sel in (("all", np.ones(len(P), bool)), ("indoor", inside), ("outdoor", ~inside)):
            if sel.sum():
                dd = d[sel]
                print(f"points[{name}]: n={sel.sum()} median err {100 * np.median(dd):.1f} cm, "
                      f"90% {100 * np.percentile(dd, 90):.1f} cm, <5cm {100 * (dd < 0.05).mean():.0f}%")
        # local consistency of the indoor part (removes the offset accumulated at the doorway)
        ins = {g["frame"] for g in gt["gt"] if g.get("inside")}
        ii = [k for k, n in enumerate(names) if n in ins]
        if len(ii) > 5:
            # indoor path is nearly a straight line -> only re-fit the translation offset
            Ea = c * E @ R.T + t
            off = np.median(G[ii] - Ea[ii], axis=0)
            c2, R2, t2 = c, R, t + off
            P2 = c2 * xyz.astype(np.float64) @ R2.T + t2
            in2 = (P2[:, 0] > 0.2) & (P2[:, 0] < 9.8) & (P2[:, 1] > 0.2) & (P2[:, 1] < 7.8) & (P2[:, 2] < 2.9)
            d2 = surface_distance(P2[in2], gt["scene"])
            tr = np.linalg.norm((c2 * E[ii] @ R2.T + t2) - G[ii], axis=1)
            print(f"indoor, offset re-fitted on indoor poses: traj median {100 * np.median(tr):.1f} cm | points n={in2.sum()} "
                  f"median err {100 * np.median(d2):.1f} cm, 90% {100 * np.percentile(d2, 90):.1f} cm")
    rep = analyse(xyz, gravity=not a.no_telemetry)
    print("structure:", json.dumps(rep, ensure_ascii=False)[:1500])
    if a.out:
        write_ply(a.out, xyz, rgb)
        print("wrote", a.out)


if __name__ == "__main__":
    main()
