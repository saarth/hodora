package app.hodora.mobile.record

import app.hodora.mobile.gpx.RawTrackPoint
import app.hodora.mobile.gpx.haversine

/**
 * Direct port of src/lib/record.ts. `acceptRecordingFix` is the one bit of
 * real math (filtering GPS jitter while stationary) — kept pure and separate
 * from RecordingService so it's testable without a real Android environment,
 * same pattern as findProximityAlert in nav/Nav.kt.
 */
data class RecordingFix(
    val lat: Double,
    val lon: Double,
    /** GPS altitude in meters, or null when the device didn't report one */
    val ele: Double?,
    /** elapsed recording seconds (paused time excluded) */
    val tSec: Double,
)

/** Minimum movement (meters) from the last accepted point before a new fix is recorded — filters GPS jitter while stationary (traffic lights, regroup stops) from inflating distance/elevation gain. */
const val MIN_RECORDING_STEP_M = 3.0

/**
 * Appends [fix] as a new track point if it's moved far enough from the last
 * accepted point (the first fix is always accepted). Returns the same list
 * reference when the fix is rejected, so callers can skip a state update
 * entirely on a no-op tick.
 */
fun acceptRecordingFix(
    points: List<RawTrackPoint>,
    fix: RecordingFix,
): List<RawTrackPoint> {
    val last = points.lastOrNull()
    if (last != null) {
        val movedM = haversine(last.lat, last.lon, fix.lat, fix.lon)
        if (movedM < MIN_RECORDING_STEP_M) return points
    }
    return points + RawTrackPoint(lat = fix.lat, lon = fix.lon, ele = fix.ele ?: 0.0, gap = false, t = Math.round(fix.tSec).toInt())
}
