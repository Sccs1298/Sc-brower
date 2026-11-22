package com.drone3d.app

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit

/**
 * WebSocket link to the Drone3D server.
 * Frame message: "D3D1" | uint32 LE json length | telemetry JSON | JPEG bytes.
 */
class StreamClient(private val listener: (String) -> Unit) {
    private val client = OkHttpClient.Builder()
        .pingInterval(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private val main = Handler(Looper.getMainLooper())
    private var ws: WebSocket? = null
    private var url: String? = null
    private var wantConnected = false
    @Volatile var connected = false
        private set
    @Volatile var sent = 0
        private set
    @Volatile var skipped = 0
        private set

    fun connect(hostPort: String) {
        url = "ws://${hostPort.removePrefix("http://").removePrefix("ws://").trimEnd('/')}/ws/drone"
        wantConnected = true
        open()
    }

    fun disconnect() {
        wantConnected = false
        ws?.close(1000, "bye")
        ws = null
        connected = false
    }

    private fun open() {
        val u = url ?: return
        ws = client.newWebSocket(Request.Builder().url(u).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connected = true
                main.post { listener("מחובר לשרת") }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {}

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = lost("נותק")

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) =
                lost("שגיאת חיבור: ${t.message}")
        })
    }

    private fun lost(why: String) {
        connected = false
        main.post { listener(why) }
        if (wantConnected) main.postDelayed({ if (wantConnected && !connected) open() }, 2000)
    }

    /** Returns false if the frame was dropped (not connected or the link is congested). */
    fun sendFrame(telemetry: JSONObject, jpeg: ByteArray): Boolean {
        val socket = ws ?: return false
        if (!connected || socket.queueSize() > 1_500_000) {   // keep latency low: drop instead of queueing
            skipped++
            return false
        }
        val js = telemetry.toString().toByteArray(Charsets.UTF_8)
        val buf = ByteBuffer.allocate(8 + js.size + jpeg.size).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("D3D1".toByteArray(Charsets.US_ASCII)).putInt(js.size).put(js).put(jpeg)
        buf.flip()
        val ok = socket.send(buf.toByteString())
        if (ok) sent++
        return ok
    }

    fun sendCommand(cmd: String) {
        ws?.send(JSONObject().put("cmd", cmd).toString())
    }
}
