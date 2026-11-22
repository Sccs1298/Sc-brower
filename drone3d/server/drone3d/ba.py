"""Local bundle adjustment with DJI-telemetry priors.

Variables: poses (R_wc, C) of the last N keyframes (the oldest is held fixed)
and the 3D points they observe. Solved with Levenberg-Marquardt, analytic
Jacobians and a Schur complement on the point blocks (fast enough for live use).

Residuals
  * reprojection error of every observation (pixels, Huber via IRLS)
  * gravity:  camera "up" vector vs. the gimbal IMU (keeps floors level)
  * relative rotation between consecutive keyframes vs. telemetry (gyro)
  * relative displacement vs. telemetry (GPS / velocity) -> keeps metric scale
The priors are quadratic (not robustified), so they cannot be out-voted by
thousands of slightly biased image measurements.

Pose update: R_wc <- R_wc * exp(dtheta), C <- C + dc.
"""
import numpy as np
from scipy.spatial.transform import Rotation

UP = np.array([0, 0, 1.0])


def _skew(v):
    """Batched skew-symmetric matrices, v: (n,3) -> (n,3,3)."""
    z = np.zeros(len(v))
    return np.stack([np.stack([z, -v[:, 2], v[:, 1]], 1),
                     np.stack([v[:, 2], z, -v[:, 0]], 1),
                     np.stack([-v[:, 1], v[:, 0], z], 1)], 1)


def _exp(w):
    return Rotation.from_rotvec(w).as_matrix()


def local_ba(K, kfs, mp_xyz, window=8, iters=10, s_grav_deg=1.0, s_rot_deg=0.7, s_pos=1.0, huber_px=2.0):
    win = kfs[-window:]
    nk = len(win)
    if nk < 3:
        return None
    obs_k, obs_p, obs_uv = [], [], []
    for i, kf in enumerate(win):
        sel = np.where(kf.pids >= 0)[0]
        obs_k.append(np.full(len(sel), i))
        obs_p.append(kf.pids[sel])
        obs_uv.append(kf.kps[sel])
    obs_k = np.concatenate(obs_k)
    obs_p = np.concatenate(obs_p)
    obs_uv = np.concatenate(obs_uv).astype(np.float64)
    _, inv, cnt = np.unique(obs_p, return_inverse=True, return_counts=True)
    keep = cnt[inv] >= 2
    obs_k, obs_p, obs_uv = obs_k[keep], obs_p[keep], obs_uv[keep]
    upid, obs_j = np.unique(obs_p, return_inverse=True)
    npnt, nobs = len(upid), len(obs_k)
    if npnt < 30:
        return None
    nv = nk - 1
    fx, fy, cx, cy = K[0, 0], K[1, 1], K[0, 2], K[1, 2]

    # telemetry priors
    s_grav, s_rot = np.radians(s_grav_deg), np.radians(s_rot_deg)
    grav = [(i, kf.R_tel.T @ UP) for i, kf in enumerate(win) if i > 0 and kf.R_tel is not None]
    rel_r, rel_t = [], []
    for i in range(1, nk):
        a, b = win[i - 1], win[i]
        if a.R_tel is not None and b.R_tel is not None:
            rel_r.append((i - 1, i, a.R_tel.T @ b.R_tel))
        if a.C_tel is not None and b.C_tel is not None:
            d = b.C_tel - a.C_tel
            sig = s_pos * ((0.35 if b.tel_src == "gps" else 0.12) + 0.08 * np.linalg.norm(d))
            rel_t.append((i - 1, i, d, sig))

    R = np.stack([kf.R_wc for kf in win])
    C = np.stack([kf.C for kf in win]).astype(np.float64)
    P = mp_xyz[upid].astype(np.float64)

    def reproj(R, C, P):
        Xc = np.einsum("nij,ni->nj", R[obs_k], P[obs_j] - C[obs_k])
        z = np.maximum(Xc[:, 2], 1e-6)
        uv = np.stack([Xc[:, 0] / z * fx + cx, Xc[:, 1] / z * fy + cy], 1)
        return uv - obs_uv, Xc, z

    def prior_terms(R, C):
        """list of (residual(3), {pose_index: J(3x6)})"""
        out = []
        for i, g in grav:
            gc = R[i].T @ UP
            J = np.zeros((3, 6))
            J[:, :3] = _skew(gc[None])[0] / s_grav
            out.append(((gc - g) / s_grav, {i: J}))
        for i, j, rr in rel_r:
            M = R[i].T @ R[j]
            e = Rotation.from_matrix(rr.T @ M).as_rotvec() / s_rot
            Ji = np.zeros((3, 6))
            Jj = np.zeros((3, 6))
            Ji[:, :3] = -M.T / s_rot
            Jj[:, :3] = np.eye(3) / s_rot
            out.append((e, {i: Ji, j: Jj}))
        for i, j, d, sig in rel_t:
            Ji = np.zeros((3, 6))
            Jj = np.zeros((3, 6))
            Ji[:, 3:] = -np.eye(3) / sig
            Jj[:, 3:] = np.eye(3) / sig
            out.append((((C[j] - C[i]) - d) / sig, {i: Ji, j: Jj}))
        return out

    def cost(R, C, P, w):
        r, _, _ = reproj(R, C, P)
        c = np.sum(w[:, None] * r * r)
        for e, _ in prior_terms(R, C):
            c += e @ e
        return 0.5 * c

    def huber_w(r):
        e = np.linalg.norm(r, axis=1)
        return np.minimum(1.0, huber_px / np.maximum(e, 1e-9))

    r, _, _ = reproj(R, C, P)
    cost0 = cost(R, C, P, huber_w(r))
    lam = 1e-3
    for _ in range(iters):
        r, Xc, z = reproj(R, C, P)
        w = huber_w(r)
        cur = cost(R, C, P, w)
        # d(uv)/d(Xc)
        Jproj = np.zeros((nobs, 2, 3))
        Jproj[:, 0, 0] = fx / z
        Jproj[:, 0, 2] = -fx * Xc[:, 0] / z ** 2
        Jproj[:, 1, 1] = fy / z
        Jproj[:, 1, 2] = -fy * Xc[:, 1] / z ** 2
        Rt = np.transpose(R[obs_k], (0, 2, 1))           # R_wc^T per obs
        Jl = Jproj @ Rt                                  # wrt point
        Jp = np.concatenate([Jproj @ _skew(Xc), -Jl], 2)  # wrt (dtheta, dC)
        sw = np.sqrt(w)
        Jl, Jp, rw = Jl * sw[:, None, None], Jp * sw[:, None, None], r * sw[:, None]

        Hpp = np.zeros((6 * nv, 6 * nv))
        gp = np.zeros(6 * nv)
        var = obs_k > 0
        kv = obs_k[var] - 1
        JpT = np.transpose(Jp[var], (0, 2, 1))
        hpp_o = JpT @ Jp[var]
        gp_o = np.einsum("nij,nj->ni", JpT, rw[var])
        for k in range(nv):
            s = kv == k
            Hpp[6 * k:6 * k + 6, 6 * k:6 * k + 6] += hpp_o[s].sum(0)
            gp[6 * k:6 * k + 6] += gp_o[s].sum(0)
        JlT = np.transpose(Jl, (0, 2, 1))
        Hll = np.zeros((npnt, 3, 3))
        gl = np.zeros((npnt, 3))
        np.add.at(Hll, obs_j, JlT @ Jl)
        np.add.at(gl, obs_j, np.einsum("nij,nj->ni", JlT, rw))
        W = np.zeros((npnt, nv, 6, 3))                   # H_pl per point
        np.add.at(W, (obs_j[var], kv), JpT @ Jl[var])
        W = W.reshape(npnt, 6 * nv, 3)
        for e, js in prior_terms(R, C):
            for a, Ja in js.items():
                if a == 0:
                    continue
                gp[6 * (a - 1):6 * a] += Ja.T @ e
                for b, Jb in js.items():
                    if b == 0:
                        continue
                    Hpp[6 * (a - 1):6 * a, 6 * (b - 1):6 * b] += Ja.T @ Jb

        improved = False
        new = cur
        for _ in range(6):
            Hll_d = Hll + lam * (np.einsum("nii->ni", Hll)[:, :, None] * np.eye(3)) + 1e-9 * np.eye(3)
            Hll_inv = np.linalg.inv(Hll_d)
            Hpp_d = Hpp + lam * np.diag(np.diag(Hpp)) + 1e-9 * np.eye(6 * nv)
            WHi = W @ Hll_inv                            # (npnt, 6nv, 3)
            WHi_f = WHi.transpose(1, 0, 2).reshape(6 * nv, -1)
            S = Hpp_d - WHi_f @ W.transpose(1, 0, 2).reshape(6 * nv, -1).T   # one BLAS GEMM
            rhs = -gp + WHi_f @ gl.ravel()
            try:
                dp = np.linalg.solve(S, rhs)
            except np.linalg.LinAlgError:
                lam *= 10
                continue
            dl = (Hll_inv @ (-gl - (W.transpose(0, 2, 1) @ dp))[:, :, None])[:, :, 0]
            dpk = dp.reshape(nv, 6)
            Rn = R.copy()
            Cn = C.copy()
            Rn[1:] = R[1:] @ _exp(dpk[:, :3])
            Cn[1:] = C[1:] + dpk[:, 3:]
            Pn = P + dl
            new = cost(Rn, Cn, Pn, w)
            if new < cur:
                R, C, P = Rn, Cn, Pn
                lam = max(lam / 3, 1e-7)
                improved = True
                break
            lam *= 8
        if not improved or (cur - new) < 1e-5 * cur:
            break

    for i, kf in enumerate(win):
        kf.R_wc, kf.C = R[i], C[i]
    mp_xyz[upid] = P
    r, Xc, _ = reproj(R, C, P)
    err = np.linalg.norm(r, axis=1)
    bad = (err > 4.0) | (Xc[:, 2] <= 1e-6)
    if bad.any():
        bad_pts = np.unique(upid[obs_j[bad]])
        for kf in win:
            kf.pids[np.isin(kf.pids, bad_pts)] = -1
    return dict(cost0=float(cost0), cost=float(cost(R, C, P, huber_w(r))), n_points=int(npnt),
                n_obs=int(nobs), rejected=int(bad.sum()))
