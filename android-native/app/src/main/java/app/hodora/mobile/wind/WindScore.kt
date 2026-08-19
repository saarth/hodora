package app.hodora.mobile.wind

import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.nav.WindEffect
import app.hodora.mobile.nav.routeBearing
import app.hodora.mobile.nav.windComponent
import app.hodora.mobile.nav.windEffect
import app.hodora.mobile.nav.windRelativeAngle
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Direct port of src/lib/windScore.ts: chunks a route into short segments,
 * classifies each against a single wind sample, and aggregates the result
 * into the tailwind/headwind/crosswind mix and a 0-100 "wind score." Built
 * entirely on nav/Nav.kt's per-instant primitives — this file only adds
 * chunking + aggregation on top of them, same as the web version does on
 * top of nav.ts.
 */
data class WindSample(
    /** wind speed in m/s */
    val windSpeedMs: Double,
    /** degrees the wind is blowing FROM, meteorological convention */
    val windDirectionDeg: Double,
)

data class WindSegment(
    val startIndex: Int,
    val endIndex: Int,
    /** segment length in meters */
    val lengthM: Double,
    val effect: WindEffect,
    /** signed angle from direction of travel to where the wind blows from */
    val relativeAngleDeg: Double,
    /** wind speed component along the direction of travel: positive = headwind */
    val componentMs: Double,
)

data class WindScoreResult(
    /** 0-100, 50 = calm/neutral, 100 = strong net tailwind, 0 = strong net headwind */
    val windScore: Int,
    val tailwindPct: Int,
    val headwindPct: Int,
    val crosswindPct: Int,
    /** distance-weighted along-route wind component; positive = net headwind */
    val meanComponentMs: Double,
    /** distance-weighted lateral wind component magnitude */
    val meanCrosswindMs: Double,
    val avgWindSpeedMs: Double,
)

/** Reference wind speed (m/s) at which a pure tailwind/headwind saturates the score. */
const val WIND_SCORE_REF_MS = 8.0

/** Default chunk length used to group route points before scoring each stretch. */
const val WIND_SEGMENT_CHUNK_M = 50.0

/**
 * Groups the route into chunks of roughly [chunkMeters], breaking early at a
 * `gap` boundary so a segment never bridges a real break in the recording
 * (e.g. a ferry crossing). Each chunk's direction of travel comes from
 * routeBearing sampled at its midpoint.
 */
fun buildWindSegments(
    points: List<RidePoint>,
    wind: WindSample,
    chunkMeters: Double = WIND_SEGMENT_CHUNK_M,
): List<WindSegment> {
    if (points.size < 2) return emptyList()
    val segments = mutableListOf<WindSegment>()
    var chunkStart = 0

    for (i in 1 until points.size) {
        val atGap = points[i].gap
        val isLast = i == points.size - 1
        val lengthM = (points[i].d - points[chunkStart].d).toDouble()
        if (!atGap && !isLast && lengthM < chunkMeters) continue

        if (lengthM > 0) {
            val midIndex = Math.round((chunkStart + i) / 2.0).toInt()
            val travelBearing = routeBearing(points, midIndex)
            if (travelBearing != null) {
                val relativeAngleDeg = windRelativeAngle(travelBearing, wind.windDirectionDeg)
                segments.add(
                    WindSegment(
                        startIndex = chunkStart,
                        endIndex = i,
                        lengthM = lengthM,
                        effect = windEffect(relativeAngleDeg),
                        relativeAngleDeg = relativeAngleDeg,
                        componentMs = windComponent(wind.windSpeedMs, relativeAngleDeg),
                    ),
                )
            }
        }
        chunkStart = i
    }

    return segments
}

/**
 * Aggregates a route's wind segments into the tailwind/headwind/crosswind
 * mix and an overall wind score. Returns null for a route too short to
 * segment (e.g. a single point).
 */
fun scoreRoute(
    points: List<RidePoint>,
    wind: WindSample,
): WindScoreResult? {
    val segments = buildWindSegments(points, wind)
    val totalLengthM = segments.sumOf { it.lengthM }
    if (totalLengthM <= 0) return null

    var tailwindM = 0.0
    var headwindM = 0.0
    var crosswindM = 0.0
    var weightedComponent = 0.0
    var weightedCrosswind = 0.0

    for (segment in segments) {
        when (segment.effect) {
            WindEffect.TAILWIND -> tailwindM += segment.lengthM
            WindEffect.HEADWIND -> headwindM += segment.lengthM
            WindEffect.CROSSWIND -> crosswindM += segment.lengthM
        }
        weightedComponent += segment.componentMs * segment.lengthM
        val lateralMs = wind.windSpeedMs * sin(segment.relativeAngleDeg * PI / 180)
        weightedCrosswind += abs(lateralMs) * segment.lengthM
    }

    val meanComponentMs = weightedComponent / totalLengthM
    val windScore = min(100.0, max(0.0, 50 - (meanComponentMs / WIND_SCORE_REF_MS) * 50)).roundToInt()

    return WindScoreResult(
        windScore = windScore,
        tailwindPct = ((tailwindM / totalLengthM) * 100).roundToInt(),
        headwindPct = ((headwindM / totalLengthM) * 100).roundToInt(),
        crosswindPct = ((crosswindM / totalLengthM) * 100).roundToInt(),
        meanComponentMs = meanComponentMs,
        meanCrosswindMs = weightedCrosswind / totalLengthM,
        avgWindSpeedMs = wind.windSpeedMs,
    )
}

/**
 * Rotation (degrees, 0-360) for an arrow icon that should point where the
 * wind is blowing TOWARD, given the meteorological "blowing FROM" direction
 * — i.e. the reverse bearing.
 */
fun windArrowRotation(windFromDeg: Double): Double = ((windFromDeg + 180) % 360 + 360) % 360
