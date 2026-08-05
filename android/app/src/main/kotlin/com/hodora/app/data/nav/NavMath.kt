package com.hodora.app.data.nav

import com.hodora.app.data.gpx.GeoMath
import com.hodora.app.data.model.RidePoint
import com.hodora.app.data.model.Snap
import com.hodora.app.data.model.Turn
import com.hodora.app.data.model.TurnDirection
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Port of src/lib/nav.ts — same constants/thresholds as the web app, see comments below. */
object NavMath {

    private const val TURN_SPAN_M = 30.0
    private const val TURN_MERGE_M = 25.0
    private const val SHARP_ANGLE = 95.0
    private const val SNAP_WINDOW_BACK = 40
    private const val SNAP_WINDOW_FWD = 200
    private const val SNAP_FALLBACK_THRESHOLD_M = 120.0
    /** snapToRoute in nav.ts uses a slightly different Earth radius than gpx.ts's haversine. */
    private const val SNAP_EARTH_RADIUS_M = 6371000.0

    const val OFF_ROUTE_THRESHOLD_M = 40.0
    const val FINISH_RADIUS_M = 20.0
    const val NEXT_TURN_BUFFER_M = 5.0

    // ---- Turn detection ----------------------------------------------------

    fun detectTurns(points: List<RidePoint>, minAngle: Double = 35.0): List<Turn> {
        if (points.size < 3) return emptyList()
        val turns = mutableListOf<Turn>()

        for (i in 1 until points.size - 1) {
            val back = findBack(points, i, TURN_SPAN_M)
            val fwd = findFwd(points, i, TURN_SPAN_M)
            if (back == i || fwd == i) continue

            val inBearing = GeoMath.bearing(points[back].lat, points[back].lon, points[i].lat, points[i].lon)
            val outBearing = GeoMath.bearing(points[i].lat, points[i].lon, points[fwd].lat, points[fwd].lon)
            val angle = GeoMath.bearingDelta(inBearing, outBearing)
            if (abs(angle) < minAngle) continue

            val last = turns.lastOrNull()
            if (last != null && points[i].d - last.at < TURN_MERGE_M) {
                if (abs(angle) > abs(last.angle)) {
                    turns[turns.size - 1] = Turn(index = i, at = points[i].d, direction = directionFor(angle), angle = angle)
                }
                continue
            }

            turns += Turn(index = i, at = points[i].d, direction = directionFor(angle), angle = angle)
        }
        return turns
    }

    private fun findBack(points: List<RidePoint>, from: Int, spanM: Double): Int {
        var back = from
        while (back > 0) {
            if (points[back].gap) break
            if (points[from].d - points[back].d >= spanM) break
            back--
        }
        return back
    }

    private fun findFwd(points: List<RidePoint>, from: Int, spanM: Double): Int {
        var fwd = from
        while (fwd < points.size - 1) {
            val next = fwd + 1
            if (points[next].gap) break
            fwd = next
            if (points[fwd].d - points[from].d >= spanM) break
        }
        return fwd
    }

    private fun directionFor(angle: Double): TurnDirection = when {
        angle > 0 -> if (angle >= SHARP_ANGLE) TurnDirection.SHARP_RIGHT else TurnDirection.RIGHT
        else -> if (angle <= -SHARP_ANGLE) TurnDirection.SHARP_LEFT else TurnDirection.LEFT
    }

    fun turnLabel(direction: TurnDirection): String = when (direction) {
        TurnDirection.LEFT -> "Turn left"
        TurnDirection.RIGHT -> "Turn right"
        TurnDirection.SHARP_LEFT -> "Sharp left"
        TurnDirection.SHARP_RIGHT -> "Sharp right"
    }

    fun nextTurn(turns: List<Turn>, progressM: Double): Turn? =
        turns.firstOrNull { it.at > progressM + NEXT_TURN_BUFFER_M }

    // ---- Route snapping ------------------------------------------------------

    private data class Candidate(val index: Int, val distM: Double, val progressM: Double, val lat: Double, val lon: Double)

    fun snapToRoute(points: List<RidePoint>, lat: Double, lon: Double, lastIndex: Int = 0): Snap {
        if (points.isEmpty()) return Snap(0, 0.0, 0.0, lat, lon)
        if (points.size == 1) {
            val dist = GeoMath.haversine(points[0].lat, points[0].lon, lat, lon)
            return Snap(0, dist, points[0].d, points[0].lat, points[0].lon)
        }

        val cosLat = cos(Math.toRadians(lat))
        fun projectX(pLon: Double) = Math.toRadians(pLon - lon) * cosLat * SNAP_EARTH_RADIUS_M
        fun projectY(pLat: Double) = Math.toRadians(pLat - lat) * SNAP_EARTH_RADIUS_M

        fun bestInRange(range: IntProgression): Candidate? {
            var best: Candidate? = null
            for (i in range) {
                if (i < 0 || i >= points.size - 1) continue
                val a = points[i]
                val b = points[i + 1]
                val ax = projectX(a.lon)
                val ay = projectY(a.lat)
                val bx = projectX(b.lon)
                val by = projectY(b.lat)
                val segDx = bx - ax
                val segDy = by - ay
                val lenSq = segDx * segDx + segDy * segDy
                val t = if (lenSq == 0.0) 0.0 else (((-ax) * segDx + (-ay) * segDy) / lenSq).coerceIn(0.0, 1.0)
                val footX = ax + t * segDx
                val footY = ay + t * segDy
                val dist = sqrt(footX * footX + footY * footY)
                if (best == null || dist < best.distM) {
                    val index = if (t >= 0.5) i + 1 else i
                    val progress = a.d + t * (b.d - a.d)
                    val bLat = a.lat + t * (b.lat - a.lat)
                    val bLon = a.lon + t * (b.lon - a.lon)
                    best = Candidate(index, dist, progress, bLat, bLon)
                }
            }
            return best
        }

        val windowed = bestInRange(max(0, lastIndex - SNAP_WINDOW_BACK)..min(points.size - 2, lastIndex + SNAP_WINDOW_FWD))
        val chosen = if (windowed == null || windowed.distM > SNAP_FALLBACK_THRESHOLD_M) {
            val full = bestInRange(0..points.size - 2)
            when {
                full == null -> windowed
                windowed == null -> full
                windowed.distM <= full.distM -> windowed
                else -> full
            }
        } else {
            windowed
        }

        val result = chosen ?: Candidate(0, GeoMath.haversine(points[0].lat, points[0].lon, lat, lon), points[0].d, points[0].lat, points[0].lon)
        return Snap(index = result.index, offRouteM = result.distM, progressM = result.progressM, lat = result.lat, lon = result.lon)
    }

    // ---- Elevation / grade ----------------------------------------------------

    fun remainingAscent(points: List<RidePoint>, fromIndex: Int): Double {
        var ascent = 0.0
        for (i in (fromIndex + 1) until points.size) {
            val dEle = points[i].ele - points[i - 1].ele
            if (dEle > 0.5) ascent += dEle
        }
        return ascent
    }

    fun upcomingGrade(points: List<RidePoint>, fromIndex: Int, spanM: Double = 200.0): Double {
        if (fromIndex >= points.size - 1) return 0.0
        val start = points[fromIndex]
        var end = start
        for (i in (fromIndex + 1) until points.size) {
            end = points[i]
            if (end.d - start.d >= spanM) break
        }
        val run = end.d - start.d
        if (run < 20.0) return 0.0
        val rise = end.ele - start.ele
        return (rise / run) * 100.0
    }

    private val COMPASS_LABELS = listOf(
        "north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west",
    )

    fun compassLabel(deg: Double): String {
        val normalized = ((deg % 360) + 360) % 360
        val idx = (normalized / 45.0).roundToInt() % 8
        return COMPASS_LABELS[idx]
    }
}
