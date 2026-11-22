package com.drone3d.avata

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

/**
 * Reads the drone height that DJI Fly prints on screen ("H 12.3m", "H 40 ft", "ALT 12.3 m")
 * with on-device text recognition, about once a second. The engine uses it as a continuous
 * metric-scale reference (DJI Avata has no SDK, so this is the only telemetry we can get).
 */
class HeightReader {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    private val busy = AtomicBoolean(false)
    private var lastTry = 0L
    @Volatile var height: Double? = null
        private set
    /** Capture time of the frame the current height was read from (sent as alt_osd_t). */
    @Volatile var at = 0L
        private set
    @Volatile var rawText: String = ""
        private set

    private val pattern = Regex("""(?:^|\s)(?:H|ALT)\s*[:=]?\s*(-?\d{1,4}(?:[.,]\d)?)\s*(m|ft)?\b""", RegexOption.IGNORE_CASE)

    /** Latest reading if it is fresh (< 2 s old). */
    fun current(now: Long = System.currentTimeMillis()): Double? = if (now - at < 2000) height else null

    fun maybeRead(rgba: ByteArray, width: Int, height: Int, rowStride: Int, now: Long = System.currentTimeMillis()) {
        if (now - lastTry < 800 || !busy.compareAndSet(false, true)) return
        lastTry = now
        val full = Bitmap.createBitmap(rowStride / 4, height, Bitmap.Config.ARGB_8888)
        full.copyPixelsFromBuffer(ByteBuffer.wrap(rgba, 0, rowStride * height))
        val bmp = if (rowStride / 4 != width) Bitmap.createBitmap(full, 0, 0, width, height) else full
        recognizer.process(InputImage.fromBitmap(bmp, 0))
            .addOnSuccessListener { text ->
                rawText = text.text.take(200)
                parse(text.text)?.let { accept(it, now) }
            }
            .addOnCompleteListener { busy.set(false) }
    }

    fun parse(text: String): Double? {
        for (line in text.lines()) {
            val m = pattern.find(line) ?: continue
            val v = m.groupValues[1].replace(',', '.').toDoubleOrNull() ?: continue
            return if (m.groupValues[2].equals("ft", ignoreCase = true)) v * 0.3048 else v
        }
        return null
    }

    private var pending: Double? = null

    private fun accept(v: Double, now: Long) {
        val prev = height
        // reject single OCR glitches: a jump > 5 m within ~1 s must be seen twice
        if (prev != null && now - at < 3000 && abs(v - prev) > 5.0) {
            if (pending == null || abs(pending!! - v) > 1.0) { pending = v; return }
        }
        pending = null
        height = v
        at = now
    }
}
