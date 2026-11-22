"""Coordinate frames.

World frame: local ENU (x=East, y=North, z=Up), origin = first telemetry fix.
Camera frame: OpenCV (x=right, y=down, z=forward).
DJI attitude: yaw (deg, clockwise from North), pitch (deg, + = nose/camera up),
roll (deg) - aerospace Z-Y-X order in NED.
"""
import math
import numpy as np

R_EARTH = 6378137.0
M_ENU_NED = np.array([[0, 1, 0], [1, 0, 0], [0, 0, -1]], float)
# Camera axes expressed in the gimbal/body frame when gimbal pitch = 0.
R_BODY_CAM0 = np.array([[0, 0, 1], [1, 0, 0], [0, 1, 0]], float)


def rot_zyx(yaw, pitch, roll):
    y, p, r = np.radians([yaw, pitch, roll])
    cy, sy, cp, sp, cr, sr = math.cos(y), math.sin(y), math.cos(p), math.sin(p), math.cos(r), math.sin(r)
    rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    ry = np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]])
    rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
    return rz @ ry @ rx


def euler_zyx(R):
    pitch = math.degrees(math.asin(max(-1.0, min(1.0, -R[2, 0]))))
    yaw = math.degrees(math.atan2(R[1, 0], R[0, 0]))
    roll = math.degrees(math.atan2(R[2, 1], R[2, 2]))
    return yaw, pitch, roll


def cam_rotation_from_attitude(yaw, pitch, roll):
    """R_wc (world ENU <- camera) from absolute gimbal attitude."""
    return M_ENU_NED @ rot_zyx(yaw, pitch, roll) @ R_BODY_CAM0


def attitude_from_cam_rotation(R_wc):
    return euler_zyx(M_ENU_NED.T @ R_wc @ R_BODY_CAM0.T)


def gps_to_enu(lat, lon, alt, lat0, lon0, alt0):
    e = math.radians(lon - lon0) * math.cos(math.radians(lat0)) * R_EARTH
    n = math.radians(lat - lat0) * R_EARTH
    return np.array([e, n, alt - alt0])


def enu_to_gps(enu, lat0, lon0, alt0):
    lat = lat0 + math.degrees(enu[1] / R_EARTH)
    lon = lon0 + math.degrees(enu[0] / (R_EARTH * math.cos(math.radians(lat0))))
    return lat, lon, alt0 + enu[2]


def intrinsics(width, height, hfov_deg):
    fx = (width / 2.0) / math.tan(math.radians(hfov_deg) / 2.0)
    return np.array([[fx, 0, width / 2.0], [0, fx, height / 2.0], [0, 0, 1]], float)


def rotation_angle_deg(Ra, Rb):
    c = (np.trace(Ra.T @ Rb) - 1) / 2
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))
