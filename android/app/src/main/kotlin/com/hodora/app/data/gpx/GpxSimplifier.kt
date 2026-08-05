package com.hodora.app.data.gpx

import com.hodora.app.data.model.RidePoint
import com.hodora.app.data.model.splitBySegments
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sqrt

/**
 * Port of `simplify`/`simplifyRDP` in src/lib/gpx.ts: Ramer-Douglas-Peucker
 * per segment (split at `gap` boundaries so a real GPX break is never
 * bridged), with a binary-searched epsilon so the total point count across
 * all segments stays under `maxPoints`.
 */
object GpxSimplifier {
    const val MAX_POINTS = 2500

    fun simplify(points: List<RidePoint>, maxPoints: Int = MAX_POINTS): List<RidePoint> {
        val segments = points.splitBySegments()
        if (segments.isEmpty()) return points

        fun countAt(epsilonM: Double): Int = segments.sumOf { simplifySegmentRDP(it, epsilonM).size }

        var hi = 200.0
        while (countAt(hi) > maxPoints && hi < 100_000.0) {
            hi *= 2
        }

        var lo = 0.0
        for (i in 0 until 25) {
            if (hi - lo <= 0.5) break
            val mid = (lo + hi) / 2
            if (countAt(mid) <= maxPoints) hi = mid else lo = mid
        }

        return segments.flatMap { simplifySegmentRDP(it, hi) }
    }

    private fun simplifySegmentRDP(points: List<RidePoint>, epsilonM: Double): List<RidePoint> {
        if (points.size <= 2) return points

        val start = points.first()
        val end = points.last()
        var maxDist = 0.0
        var splitIndex = 0
        for (i in 1 until points.size - 1) {
            val dist = perpendicularDistanceM(points[i], start, end)
            if (dist > maxDist) {
                maxDist = dist
                splitIndex = i
            }
        }

        return if (maxDist > epsilonM) {
            val left = simplifySegmentRDP(points.subList(0, splitIndex + 1), epsilonM)
            val right = simplifySegmentRDP(points.subList(splitIndex, points.size), epsilonM)
            left.dropLast(1) + right
        } else {
            listOf(start, end)
        }
    }

    /** Perpendicular distance (meters) from `point` to the infinite line through `lineStart`/`lineEnd`,
     * via a local equirectangular projection centered on `lineStart`. */
    private fun perpendicularDistanceM(point: RidePoint, lineStart: RidePoint, lineEnd: RidePoint): Double {
        val cosLat = cos(Math.toRadians(lineStart.lat))

        fun projectX(lon: Double) = Math.toRadians(lon - lineStart.lon) * cosLat * GeoMath.EARTH_RADIUS_M
        fun projectY(lat: Double) = Math.toRadians(lat - lineStart.lat) * GeoMath.EARTH_RADIUS_M

        val ex = projectX(lineEnd.lon)
        val ey = projectY(lineEnd.lat)
        val px = projectX(point.lon)
        val py = projectY(point.lat)

        val lineLenSq = ex * ex + ey * ey
        return if (lineLenSq == 0.0) {
            sqrt(px * px + py * py)
        } else {
            abs(ex * py - ey * px) / sqrt(lineLenSq)
        }
    }
}
