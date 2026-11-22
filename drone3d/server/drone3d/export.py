"""Exports: coloured PLY point cloud, and a nerfstudio-style transforms.json
so the recorded flight can be refined offline (Gaussian Splatting / NeRF /
photogrammetry) into a high-quality mesh."""
import json
import os

import numpy as np


def write_ply(path_or_file, xyz, rgb):
    xyz = np.asarray(xyz, np.float32)
    rgb = np.asarray(rgb, np.uint8)
    header = ("ply\nformat binary_little_endian 1.0\n"
              f"element vertex {len(xyz)}\n"
              "property float x\nproperty float y\nproperty float z\n"
              "property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n").encode()
    rec = np.zeros(len(xyz), dtype=[("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("r", "u1"), ("g", "u1"), ("b", "u1")])
    if len(xyz):
        rec["x"], rec["y"], rec["z"] = xyz.T
        rec["r"], rec["g"], rec["b"] = rgb.T
    data = header + rec.tobytes()
    if hasattr(path_or_file, "write"):
        path_or_file.write(data)
    else:
        with open(path_or_file, "wb") as f:
            f.write(data)
    return data


def write_transforms(path, K, size, frames):
    """frames: list of (relative_image_path, R_wc, C) in OpenCV camera convention."""
    out = dict(fl_x=K[0, 0], fl_y=K[1, 1], cx=K[0, 2], cy=K[1, 2], w=size[0], h=size[1],
               camera_model="OPENCV", k1=0, k2=0, p1=0, p2=0, frames=[])
    flip = np.diag([1, -1, -1])  # OpenCV -> OpenGL camera axes
    for name, R_wc, C in frames:
        M = np.eye(4)
        M[:3, :3] = R_wc @ flip
        M[:3, 3] = C
        out["frames"].append(dict(file_path=name, transform_matrix=M.tolist()))
    with open(path, "w") as f:
        json.dump(out, f, indent=1)
    return out


def session_dir(root, name):
    p = os.path.join(root, name)
    os.makedirs(os.path.join(p, "frames"), exist_ok=True)
    return p
