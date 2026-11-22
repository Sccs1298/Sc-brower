"""Multi-resolution voxel hash map for the fused point cloud.

Points close to the camera go into fine voxels, far points into coarse ones,
so the same map holds a whole building facade (seen from 20 m) and the inside
of a room (seen from 1-2 m).
"""
import numpy as np

_OFF = 1 << 20


class VoxelMap:
    def __init__(self, base_size=0.02, levels=5, ratio=2.5, min_obs=2):
        self.sizes = np.array([base_size * ratio ** k for k in range(levels)])
        self.min_obs = min_obs
        self.index = {}                       # key -> row
        cap = 1 << 16
        self.sum_xyz = np.zeros((cap, 3), np.float64)
        self.sum_rgb = np.zeros((cap, 3), np.float64)
        self.count = np.zeros(cap, np.float32)   # independent observations (one per insert call)
        self.npts = np.zeros(cap, np.float32)    # points averaged into the voxel
        self.emitted = np.zeros(cap, bool)
        self.n = 0

    def _grow(self, need):
        cap = len(self.count)
        if need <= cap:
            return
        while cap < need:
            cap *= 2
        for name in ("sum_xyz", "sum_rgb", "count", "npts", "emitted"):
            old = getattr(self, name)
            new = np.zeros((cap,) + old.shape[1:], old.dtype)
            new[: self.n] = old[: self.n]
            setattr(self, name, new)

    def level_for_depth(self, depth):
        # voxel ~ 0.6% of viewing distance
        want = np.maximum(depth, 1e-6) * 0.006
        lvl = np.searchsorted(self.sizes, want)
        return np.clip(lvl, 0, len(self.sizes) - 1)

    def insert(self, xyz, rgb, depth, weight=1.0):
        """Insert points; returns (xyz, rgb) of voxels that just became confirmed."""
        if len(xyz) == 0:
            return np.zeros((0, 3), np.float32), np.zeros((0, 3), np.uint8)
        lvl = self.level_for_depth(depth)
        size = self.sizes[lvl][:, None]
        ijk = np.floor(xyz / size).astype(np.int64) + _OFF
        keys = (lvl.astype(np.int64) << 61) | (ijk[:, 0] << 40) | (ijk[:, 1] << 20) | ijk[:, 2]
        ukeys, inv = np.unique(keys, return_inverse=True)
        rows = np.empty(len(ukeys), np.int64)
        self._grow(self.n + len(ukeys))
        index = self.index
        n = self.n
        for i, k in enumerate(ukeys.tolist()):
            r = index.get(k)
            if r is None:
                r = n
                index[k] = r
                n += 1
            rows[i] = r
        self.n = n
        r = rows[inv]
        np.add.at(self.sum_xyz, r, xyz)
        np.add.at(self.sum_rgb, r, rgb.astype(np.float64))
        np.add.at(self.npts, r, 1.0)
        # each insert (= one keyframe pair) counts once per voxel -> real multi-view confirmation
        self.count[rows] += weight
        cand = rows
        new = cand[(self.count[cand] >= self.min_obs) & ~self.emitted[cand]]
        self.emitted[new] = True
        c = self.npts[new][:, None]
        return (self.sum_xyz[new] / c).astype(np.float32), np.clip(self.sum_rgb[new] / c, 0, 255).astype(np.uint8)

    def points(self, confirmed_only=True):
        sel = np.arange(self.n)
        if confirmed_only:
            sel = sel[self.emitted[: self.n]]
        c = self.npts[sel][:, None]
        return (self.sum_xyz[sel] / c).astype(np.float32), np.clip(self.sum_rgb[sel] / c, 0, 255).astype(np.uint8)

    def __len__(self):
        return int(self.emitted[: self.n].sum())
