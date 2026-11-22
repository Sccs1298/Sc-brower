"""Turns raw DJI telemetry messages into an approximate camera pose (prior).

Message fields (all optional, sent by the Android app):
  t           timestamp, ms
  lat, lon    degrees (aircraft GPS)
  alt         m, altitude relative to take-off (barometric)
  gps_level   0..5 (DJI GPSSignalLevel); <3 => position from GPS is ignored
  vel         [north, east, down] m/s (works indoors with vision positioning)
  att         aircraft [pitch, roll, yaw] deg
  gimbal      gimbal  [pitch, roll, yaw] deg
  gimbal_yaw_relative  true if gimbal yaw is relative to aircraft heading
  hfov        horizontal field of view of the live stream, deg
"""
import numpy as np
from .geo import cam_rotation_from_attitude, gps_to_enu


class TelemetryPose:
    def __init__(self):
        self.origin = None          # (lat, lon, alt)
        self.pos = None             # ENU position estimate
        self.last_t = None
        self.source = "none"

    def update(self, tm):
        """Returns (R_wc, C, source) or (None, None, 'none')."""
        if not tm:
            return None, None, "none"
        t = tm.get("t")
        R = None
        g = tm.get("gimbal")
        a = tm.get("att")
        if g is not None:
            yaw = g[2]
            if tm.get("gimbal_yaw_relative") and a is not None:
                yaw += a[2]
            R = cam_rotation_from_attitude(yaw, g[0], g[1])
        elif a is not None:
            R = cam_rotation_from_attitude(a[2], 0.0, 0.0)

        lat, lon, alt = tm.get("lat"), tm.get("lon"), tm.get("alt")
        gps_ok = (lat is not None and lon is not None and tm.get("gps_level", 5) >= 3
                  and abs(lat) > 1e-6 and abs(lon) > 1e-6)
        if gps_ok:
            if self.origin is None:
                self.origin = (lat, lon, alt or 0.0)
            gps_pos = gps_to_enu(lat, lon, alt or 0.0, *self.origin)
            if self.pos is None:
                self.pos = gps_pos
            else:  # complementary filter: predict with velocity, correct with GPS
                if tm.get("vel") is not None and t is not None and self.last_t is not None:
                    dt = max(0.0, min(1.0, (t - self.last_t) / 1000.0))
                    n, e, d = tm["vel"]
                    self.pos = self.pos + np.array([e, n, -d]) * dt
                self.pos = self.pos + 0.35 * (gps_pos - self.pos)
            self.source = "gps"
        elif tm.get("vel") is not None and t is not None:
            if self.pos is None:
                self.pos = np.array([0.0, 0.0, alt or 0.0])
            elif self.last_t is not None:
                dt = max(0.0, min(1.0, (t - self.last_t) / 1000.0))
                n, e, d = tm["vel"]
                self.pos = self.pos + np.array([e, n, -d]) * dt
                if alt is not None:
                    self.pos[2] = alt
            self.source = "velocity"
        if t is not None:
            self.last_t = t
        return R, (None if self.pos is None else self.pos.copy()), self.source
