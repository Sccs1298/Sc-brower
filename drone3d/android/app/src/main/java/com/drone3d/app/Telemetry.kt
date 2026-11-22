package com.drone3d.app

import org.json.JSONArray
import org.json.JSONObject

/**
 * Latest aircraft state, updated by DJI key listeners and stamped onto every frame.
 * Field names match the server's protocol (see server/drone3d/telemetry.py).
 */
class Telemetry {
    @Volatile var lat: Double? = null
    @Volatile var lon: Double? = null
    @Volatile var alt: Double? = null            // m, relative to take-off
    @Volatile var gpsLevel: Int = 0              // DJI GPSSignalLevel 0..5
    @Volatile var velNED: DoubleArray? = null    // m/s north, east, down
    @Volatile var att: DoubleArray? = null       // aircraft pitch, roll, yaw (deg)
    @Volatile var gimbal: DoubleArray? = null    // gimbal pitch, roll, yaw (deg)
    @Volatile var ultrasonicHeight: Double? = null
    @Volatile var hfov: Double = 73.7            // live stream horizontal FOV (deg)
    @Volatile var gimbalYawRelative: Boolean = false

    fun toJson(width: Int, height: Int, tMillis: Long): JSONObject {
        val o = JSONObject()
        o.put("t", tMillis)
        o.put("w", width)
        o.put("h", height)
        o.put("hfov", hfov)
        lat?.let { o.put("lat", it) }
        lon?.let { o.put("lon", it) }
        alt?.let { o.put("alt", it) }
        o.put("gps_level", gpsLevel)
        velNED?.let { o.put("vel", JSONArray(it.toList())) }
        att?.let { o.put("att", JSONArray(it.toList())) }
        gimbal?.let { o.put("gimbal", JSONArray(it.toList())) }
        ultrasonicHeight?.let { o.put("us_height", it) }
        if (gimbalYawRelative) o.put("gimbal_yaw_relative", true)
        return o
    }
}
