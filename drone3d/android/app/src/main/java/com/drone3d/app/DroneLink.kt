package com.drone3d.app

import android.content.Context
import android.graphics.Rect
import android.graphics.YuvImage
import android.graphics.ImageFormat
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Surface
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.key.GimbalKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.value.common.Attitude
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.sdk.keyvalue.value.common.LocationCoordinate3D
import dji.sdk.keyvalue.value.common.Velocity3D
import dji.sdk.keyvalue.value.flightcontroller.GPSSignalLevel
import dji.open.pilot.client.manager.ServerState
import dji.v5.common.error.IDJIError
import dji.v5.common.register.DJISDKInitEvent
import dji.v5.manager.KeyManager
import dji.v5.manager.SDKManager
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.interfaces.ICameraStreamManager
import dji.v5.manager.interfaces.SDKManagerCallback
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Everything DJI: SDK registration, telemetry key listeners and the decoded live video.
 *
 * Frames arrive from the SDK at the stream rate (~30 fps). We keep [targetFps] of them,
 * JPEG-encode on a background thread and hand them to [onFrame] together with the
 * telemetry snapshot taken at the same moment.
 */
class DroneLink(
    private val context: Context,
    private val onStatus: (String) -> Unit,
    private val onFrame: (jpeg: ByteArray, width: Int, height: Int, telemetry: Telemetry, tMillis: Long) -> Unit,
) {
    val telemetry = Telemetry()
    @Volatile var targetFps = 4.0
    @Volatile var jpegQuality = 85
    @Volatile var streaming = false

    private val main = Handler(Looper.getMainLooper())
    private val encoder = Executors.newSingleThreadExecutor()
    private val encoding = AtomicBoolean(false)
    private var lastFrameAt = 0L
    private var listening = false
    private val camera = ComponentIndexType.LEFT_OR_MAIN

    private fun status(s: String) = main.post { onStatus(s) }

    // ------------------------------------------------------------------ SDK
    fun start() {
        SDKManager.getInstance().init(context, object : SDKManagerCallback {
            override fun onRegisterSuccess() {
                status("DJI SDK רשום ✓ – חבר את השלט ואת הרחפן")
                startTelemetry()
            }

            override fun onRegisterFailure(error: IDJIError) {
                status("רישום DJI נכשל: ${error.description()} (בדוק DJI_API_KEY ואינטרנט)")
            }

            override fun onProductDisconnect(productId: Int) { status("הרחפן התנתק") }
            override fun onProductConnect(productId: Int) { status("רחפן מחובר ✓") }
            override fun onProductChanged(productId: Int) {}
            override fun onRemoteServerStateUpdated(state: ServerState?) {}
            override fun onRemoteServerCompatibleError(error: IDJIError?) {}
            override fun onInitProcess(event: DJISDKInitEvent, totalProcess: Int) {
                if (event == DJISDKInitEvent.INITIALIZE_COMPLETE) {
                    SDKManager.getInstance().registerApp()
                }
            }

            override fun onDatabaseDownloadProgress(current: Long, total: Long) {}
        })
    }

    fun stop() {
        stopVideo()
        KeyManager.getInstance().cancelListen(this)
        listening = false
        encoder.shutdownNow()
    }

    // ------------------------------------------------------------ telemetry
    private fun startTelemetry() {
        if (listening) return
        listening = true
        val km = KeyManager.getInstance()
        km.listen(KeyTools.createKey(FlightControllerKey.KeyAircraftLocation3D), this) { _, v: LocationCoordinate3D? ->
            v?.let { telemetry.lat = it.latitude; telemetry.lon = it.longitude; telemetry.alt = it.altitude }
        }
        km.listen(KeyTools.createKey(FlightControllerKey.KeyGPSSignalLevel), this) { _, v: GPSSignalLevel? ->
            telemetry.gpsLevel = v?.value() ?: 0
        }
        km.listen(KeyTools.createKey(FlightControllerKey.KeyAircraftVelocity), this) { _, v: Velocity3D? ->
            v?.let { telemetry.velNED = doubleArrayOf(it.x, it.y, it.z) }
        }
        km.listen(KeyTools.createKey(FlightControllerKey.KeyAircraftAttitude), this) { _, v: Attitude? ->
            v?.let { telemetry.att = doubleArrayOf(it.pitch, it.roll, it.yaw) }
        }
        km.listen(KeyTools.createKey(FlightControllerKey.KeyUltrasonicHeight), this) { _, v: Int? ->
            telemetry.ultrasonicHeight = v?.let { it / 10.0 }      // decimetres -> metres
        }
        km.listen(KeyTools.createKey(GimbalKey.KeyGimbalAttitude, camera), this) { _, v: Attitude? ->
            v?.let { telemetry.gimbal = doubleArrayOf(it.pitch, it.roll, it.yaw) }
        }
    }

    // ---------------------------------------------------------------- video
    private val frameListener = ICameraStreamManager.CameraFrameListener { data, offset, length, width, height, format ->
        if (!streaming) return@CameraFrameListener
        val now = System.currentTimeMillis()
        if (now - lastFrameAt < (1000.0 / targetFps).toLong()) return@CameraFrameListener
        if (!encoding.compareAndSet(false, true)) return@CameraFrameListener   // encoder busy: drop
        lastFrameAt = now
        // snapshot telemetry *now*, together with the frame
        val tm = Telemetry().also { s ->
            s.lat = telemetry.lat; s.lon = telemetry.lon; s.alt = telemetry.alt; s.gpsLevel = telemetry.gpsLevel
            s.velNED = telemetry.velNED; s.att = telemetry.att; s.gimbal = telemetry.gimbal
            s.ultrasonicHeight = telemetry.ultrasonicHeight; s.hfov = telemetry.hfov
            s.gimbalYawRelative = telemetry.gimbalYawRelative
        }
        val nv21 = data.copyOfRange(offset, offset + length)
        encoder.execute {
            try {
                val out = ByteArrayOutputStream(width * height / 4)
                YuvImage(nv21, ImageFormat.NV21, width, height, null)
                    .compressToJpeg(Rect(0, 0, width, height), jpegQuality, out)
                onFrame(out.toByteArray(), width, height, tm, now)
            } catch (t: Throwable) {
                Log.w("Drone3D", "jpeg encode failed", t)
            } finally {
                encoding.set(false)
            }
        }
    }

    fun startVideo(surface: Surface?, width: Int, height: Int) {
        val csm = MediaDataCenter.getInstance().cameraStreamManager
        if (surface != null) {
            csm.putCameraStreamSurface(camera, surface, width, height, ICameraStreamManager.ScaleType.CENTER_INSIDE)
        }
        csm.addFrameListener(camera, ICameraStreamManager.FrameFormat.NV21, frameListener)
    }

    fun stopVideo(surface: Surface? = null) {
        val csm = MediaDataCenter.getInstance().cameraStreamManager
        csm.removeFrameListener(frameListener)
        if (surface != null) csm.removeCameraStreamSurface(surface)
    }
}
