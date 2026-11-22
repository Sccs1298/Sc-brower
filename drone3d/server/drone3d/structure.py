"""Building-structure analysis on the fused point cloud.

* Extracts dominant planes (RANSAC) and classifies them as floor/ceiling/roof
  (horizontal) or wall/facade (vertical) using gravity from the drone IMU.
* Finds openings (windows / doors) as enclosed holes in facade occupancy grids
  - glass has no texture/reflects, so it shows up as a hole in the point cloud.
* Estimates the number of storeys from building height and window rows.
"""
import numpy as np
import cv2

FLOOR_HEIGHT = 3.0


def _fit_plane(P):
    c = P.mean(0)
    _, _, Vt = np.linalg.svd(P - c, full_matrices=False)
    n = Vt[2]
    return n / np.linalg.norm(n), c


def ransac_planes(P, thr, min_pts, max_planes=14, iters=400, rng=None):
    rng = rng or np.random.default_rng(0)
    planes = []
    rest = np.arange(len(P))
    for _ in range(max_planes):
        if len(rest) < min_pts:
            break
        Q = P[rest]
        best, best_n = None, 0
        for _ in range(iters):
            s = Q[rng.choice(len(Q), 3, replace=False)]
            n = np.cross(s[1] - s[0], s[2] - s[0])
            nn = np.linalg.norm(n)
            if nn < 1e-9:
                continue
            n /= nn
            # prefer axis-aligned structure: snap near-vertical / near-horizontal normals
            inl = np.abs((Q - s[0]) @ n) < thr
            k = int(inl.sum())
            if k > best_n:
                best, best_n = inl, k
        if best is None or best_n < min_pts:
            break
        n, c = _fit_plane(Q[best])
        inl = np.abs((Q - c) @ n) < thr
        n, c = _fit_plane(Q[inl])
        planes.append((n, c, rest[inl]))
        rest = rest[~inl]
    return planes


def _grid(uv, cell):
    lo = uv.min(0)
    ij = np.floor((uv - lo) / cell).astype(int)
    shape = ij.max(0) + 1
    g = np.zeros((shape[1], shape[0]), np.uint8)
    g[ij[:, 1], ij[:, 0]] = 1
    return g, lo


def _edge_extent(uv, c0, c1, lo_box, hi_box, axis):
    """Distance between the nearest points on both sides of a hole along `axis`,
    looking only inside the hole's band on the other axis."""
    o = 1 - axis
    band = (uv[:, o] > lo_box[o]) & (uv[:, o] < hi_box[o])
    v = uv[band, axis]
    left = v[(v < c0) & (v > lo_box[axis] - 1.5)]
    right = v[(v > c1) & (v < hi_box[axis] + 1.5)]
    if len(left) == 0 or len(right) == 0:
        return None, None
    return float(left.max()), float(right.min())


def _openings(g, lo, cell, to_world, ground_z, uv=None):
    """Enclosed empty regions of a facade grid -> window/door candidates."""
    if g.shape[0] < 4 or g.shape[1] < 4:
        return []
    closed = cv2.morphologyEx(g, cv2.MORPH_CLOSE, np.ones((2, 2), np.uint8))
    empty = (closed == 0).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(empty, connectivity=4)
    H, W = g.shape
    out = []
    for k in range(1, n):
        x, y, w, h, area = st[k]
        touches_side = x == 0 or x + w >= W or y + h >= H
        touches_bottom = y == 0
        if touches_side:
            continue
        wm, hm = w * cell, h * cell
        cu = lo[0] + (x + w / 2) * cell
        cv_ = lo[1] + (y + h / 2) * cell
        v_bottom = lo[1] + y * cell
        if uv is not None:
            # refine size from the actual points bordering the hole (less cell quantisation)
            a0, a1 = lo[0] + x * cell, lo[0] + (x + w) * cell
            b0, b1 = lo[1] + y * cell, lo[1] + (y + h) * cell
            inner_lo = (a0 + 0.25 * (a1 - a0), b0 + 0.25 * (b1 - b0))
            inner_hi = (a1 - 0.25 * (a1 - a0), b1 - 0.25 * (b1 - b0))
            l, r = _edge_extent(uv, a0 + cell, a1 - cell, inner_lo, inner_hi, 0) if w > 2 else (None, None)
            bt, tp = _edge_extent(uv, b0 + cell, b1 - cell, inner_lo, inner_hi, 1) if h > 2 else (None, None)
            if l is not None and r - l < wm + 2 * cell:
                wm, cu = r - l, (l + r) / 2
            if bt is not None and tp - bt < hm + 2 * cell:
                hm, cv_, v_bottom = tp - bt, (bt + tp) / 2, bt
        if not (0.7 <= wm <= 4.0 and 0.6 <= hm <= 3.2) or area < 0.6 * w * h:
            continue
        centre = to_world(cu, cv_)
        bottom_z = to_world(cu, v_bottom)[2]
        near_ground = ground_z is not None and bottom_z - ground_z < 0.4
        door_shape = 0.7 <= wm <= 2.6 and 1.7 <= hm <= 2.8
        if touches_bottom or near_ground:
            if not door_shape:
                continue          # hole at the bottom edge = unobserved strip, not an opening
            kind = "door"
        else:
            kind = "window"
        out.append(dict(kind=kind, center=[round(float(v), 2) for v in centre], width=round(wm, 2), height=round(hm, 2)))
    return out


def analyse(xyz, gravity=True, max_points=60000):
    P = np.asarray(xyz, np.float64)
    if len(P) < 500:
        return dict(planes=[], storeys=None, openings=[], note="not enough points yet")
    rng = np.random.default_rng(0)
    if len(P) > max_points:
        P = P[rng.choice(len(P), max_points, replace=False)]
    diag = float(np.linalg.norm(np.percentile(P, 98, 0) - np.percentile(P, 2, 0)))
    thr = float(np.clip(0.004 * diag, 0.02, 0.1))
    cell = float(np.clip(0.012 * diag, 0.1, 0.3))
    planes = ransac_planes(P, thr, max(300, int(0.015 * len(P))), rng=rng)
    up = np.array([0, 0, 1.0])
    out = []
    horiz = []
    for n, c, idx in planes:
        Q = P[idx]
        if gravity and abs(n @ up) > 0.95:
            kind = "horizontal"
            u = np.array([1.0, 0, 0])
            v = np.array([0, 1.0, 0])
        elif gravity and abs(n @ up) < 0.12:
            kind = "vertical"
            u = np.cross(up, n)
            u /= np.linalg.norm(u)
            v = up
        else:
            kind = "slanted" if gravity else "plane"
            _, _, Vt = np.linalg.svd(Q - c, full_matrices=False)
            u, v = Vt[0], Vt[1]
        uv = np.stack([(Q - c) @ u, (Q - c) @ v], 1)
        g, lo = _grid(uv, cell)
        area = float(g.sum() * cell * cell)
        rec = dict(kind=kind, normal=[round(float(x), 3) for x in n], point=[round(float(x), 2) for x in c],
                   area_m2=round(area, 1), n_points=int(len(idx)),
                   extent=[round(float(x), 2) for x in (uv.max(0) - uv.min(0))])
        if kind == "horizontal":
            rec["height"] = round(float(c[2]), 2)
            horiz.append(rec)
        rec["_g"], rec["_lo"], rec["_uvc"], rec["_uv"] = g, lo, (u, v, c), uv
        out.append(rec)

    ground = min((h for h in horiz if h["area_m2"] > 8), key=lambda h: h["height"], default=None)
    ground_z = ground["height"] if ground else None
    openings = []
    for rec in out:
        if rec["kind"] == "vertical":
            u, v, c = rec["_uvc"]
            ops = _openings(rec["_g"], rec["_lo"], cell, lambda a, b, u=u, v=v, c=c: c + a * u + b * v, ground_z,
                            rec["_uv"])
            for o in ops:
                o["normal"] = rec["normal"]
            rec["openings"] = len(ops)
            openings += ops
    for rec in out:
        for k in ("_g", "_lo", "_uvc", "_uv"):
            rec.pop(k)

    storeys = None
    levels = []
    if gravity:
        levels = sorted({h["height"] for h in horiz if h["area_m2"] > 4})
        vert_top = [float(np.percentile(P[idx][:, 2], 98)) for n, c, idx in planes if abs(n @ up) < 0.12]
        top = max(vert_top + [h["height"] for h in horiz], default=None)
        est_h = None
        if ground_z is not None and top is not None:
            est_h = top - ground_z
        rows = sorted(o["center"][2] for o in openings if o["kind"] == "window")
        groups = []
        for z in rows:
            if groups and z - groups[-1][-1] <= 1.2:
                groups[-1].append(z)
            else:
                groups.append([z])
        min_per_row = 2 if len(rows) >= 4 else 1     # ignore isolated holes once a facade pattern is visible
        win_rows = sum(1 for g in groups if len(g) >= min_per_row)
        by_height = round(est_h / FLOOR_HEIGHT) if est_h and est_h > 2 else None
        storeys = dict(estimate=max(filter(None, [by_height, win_rows or None]), default=None),
                       building_height_m=None if est_h is None else round(est_h, 2),
                       window_rows=win_rows, horizontal_levels_m=levels)
    return dict(planes=out, storeys=storeys, openings=openings, ground_z=ground_z)
