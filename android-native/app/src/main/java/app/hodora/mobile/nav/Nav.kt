package app.hodora.mobile.nav

import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.gpx.bearing
import app.hodora.mobile.gpx.bearingDelta
import app.hodora.mobile.gpx.haversine
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

/** Direct port of src/lib/nav.ts — turn detection, live-position-to-route snapping, and the navigation math the nav screen and NavigationService share. */

enum class TurnDirection { LEFT, SHARP_LEFT, RIGHT, SHARP_RIGHT }

data class Turn(
    val index: Int,
    /** cumulative route distance in meters where the turn happens */
    val at: Int,
    val direction: TurnDirection,
    /** signed angle, positive = right */
    val angle: Double,
)

/** Perpendicular-ish snap of a position onto the route. */
data class Snap(
    val index: Int,
    /** distance from the position to the route in meters */
    val offRouteM: Double,
    /** cumulative route distance at the snapped point */
    val progressM: Double,
    /** latitude of the closest point on the route (the rejoin point) */
    val lat: Double,
    /** longitude of the closest point on the route (the rejoin point) */
    val lon: Double,
)

private fun directionFor(angle: Double): TurnDirection =
    if (angle > 0) {
        if (angle >= 95) TurnDirection.SHARP_RIGHT else TurnDirection.RIGHT
    } else {
        if (angle <= -95) TurnDirection.SHARP_LEFT else TurnDirection.LEFT
    }

/**
 * Detect turns by comparing the bearing of the ~30m before a point with the
 * ~30m after it. Consecutive detections are collapsed into one turn.
 */
fun detectTurns(
    points: List<RidePoint>,
    minAngle: Double = 35.0,
): List<Turn> {
    val turns = mutableListOf<Turn>()
    val span = 30

    // Stop at a `gap` boundary (a real break between GPX <trkseg>s) so a
    // turn is never computed from the bearing across it.
    fun findIndexAtDistance(from: Int, delta: Int): Int {
        val target = points[from].d + delta
        var i = from
        if (delta > 0) {
            while (i < points.size - 1 && points[i].d < target && !points[i + 1].gap) i++
        } else {
            while (i > 0 && points[i].d > target && !points[i].gap) i--
        }
        return i
    }

    for (i in 1 until points.size - 1) {
        val back = findIndexAtDistance(i, -span)
        val fwd = findIndexAtDistance(i, span)
        if (back == i || fwd == i) continue

        val inBearing = bearing(points[back].lat, points[back].lon, points[i].lat, points[i].lon)
        val outBearing = bearing(points[i].lat, points[i].lon, points[fwd].lat, points[fwd].lon)
        val angle = bearingDelta(inBearing, outBearing)
        if (abs(angle) < minAngle) continue

        val last = turns.lastOrNull()
        if (last != null && points[i].d - last.at < 25) {
            if (abs(angle) > abs(last.angle)) {
                turns[turns.size - 1] =
                    last.copy(index = i, at = points[i].d, angle = angle, direction = directionFor(angle))
            }
            continue
        }

        turns.add(Turn(index = i, at = points[i].d, angle = angle, direction = directionFor(angle)))
    }

    return turns
}

/**
 * Snap a live position onto the route using perpendicular projection onto
 * each route segment (not just the nearest vertex). Searches near the last
 * known index for speed, falling back to a full scan when far away.
 */
fun snapToRoute(
    points: List<RidePoint>,
    lat: Double,
    lon: Double,
    lastIndex: Int = 0,
): Snap {
    if (points.isEmpty()) return Snap(index = 0, offRouteM = 0.0, progressM = 0.0, lat = lat, lon = lon)
    if (points.size == 1) {
        val p = points[0]
        return Snap(
            index = 0,
            offRouteM = haversine(lat, lon, p.lat, p.lon),
            progressM = p.d.toDouble(),
            lat = p.lat,
            lon = p.lon,
        )
    }

    // Local equirectangular projection in meters around the live position.
    val r = 6_371_000.0
    val cosLat = cos(lat * PI / 180)

    fun toX(pLon: Double) = (pLon - lon) * PI * r * cosLat / 180
    fun toY(pLat: Double) = (pLat - lat) * PI * r / 180

    data class ScanResult(val index: Int, val dist: Double, val progress: Double, val lat: Double, val lon: Double)

    fun scan(from: Int, to: Int): ScanResult {
        var bestIndex = from
        var bestDist = Double.POSITIVE_INFINITY
        var bestProgress = points[from].d.toDouble()
        var bestLat = points[from].lat
        var bestLon = points[from].lon

        for (i in from until to) {
            val ax = toX(points[i].lon)
            val ay = toY(points[i].lat)
            val bx = toX(points[i + 1].lon)
            val by = toY(points[i + 1].lat)
            val dx = bx - ax
            val dy = by - ay
            val lenSq = dx * dx + dy * dy
            val t = if (lenSq > 0) max(0.0, min(1.0, (-ax * dx - ay * dy) / lenSq)) else 0.0
            val px = ax + t * dx
            val py = ay + t * dy
            val dist = hypot(px, py)
            if (dist < bestDist) {
                bestDist = dist
                bestIndex = if (t >= 0.5) i + 1 else i
                bestProgress = points[i].d + t * (points[i + 1].d - points[i].d)
                bestLat = points[i].lat + t * (points[i + 1].lat - points[i].lat)
                bestLon = points[i].lon + t * (points[i + 1].lon - points[i].lon)
            }
        }

        return ScanResult(bestIndex, bestDist, bestProgress, bestLat, bestLon)
    }

    val windowStart = max(0, lastIndex - 40)
    val windowEnd = min(points.size - 1, lastIndex + 200)
    var best = scan(windowStart, windowEnd)

    if (best.dist > 120) {
        val full = scan(0, points.size - 1)
        if (full.dist < best.dist) best = full
    }

    return Snap(index = best.index, offRouteM = best.dist, progressM = best.progress, lat = best.lat, lon = best.lon)
}

fun nextTurn(
    turns: List<Turn>,
    progressM: Double,
): Turn? = turns.firstOrNull { it.at > progressM + 5 }

/** Default lookahead distance for findProximityAlert — far enough to give a rider a few seconds' notice at cycling speed, close enough not to fire miles early. */
const val PROXIMITY_ALERT_RADIUS_M = 150.0

/**
 * The nearest not-yet-alerted note within radiusM ahead of the rider's
 * current progress, or null if there isn't one. A small negative slack
 * (-20m) is allowed so a note doesn't get skipped by GPS/snap jitter
 * landing a couple of meters past it before the alert fires.
 */
fun <T> findProximityAlert(
    notes: List<T>,
    progressM: Double,
    alerted: Set<String>,
    idOf: (T) -> String,
    distanceMOf: (T) -> Double,
    radiusM: Double = PROXIMITY_ALERT_RADIUS_M,
): T? {
    var best: T? = null
    var bestAhead = Double.POSITIVE_INFINITY
    for (note in notes) {
        if (alerted.contains(idOf(note))) continue
        val ahead = distanceMOf(note) - progressM
        if (ahead < -20 || ahead > radiusM) continue
        if (ahead < bestAhead) {
            best = note
            bestAhead = ahead
        }
    }
    return best
}

fun turnLabel(direction: TurnDirection): String =
    when (direction) {
        TurnDirection.LEFT -> "Turn left"
        TurnDirection.RIGHT -> "Turn right"
        TurnDirection.SHARP_LEFT -> "Sharp left"
        TurnDirection.SHARP_RIGHT -> "Sharp right"
    }

/** Elevation still to climb from the current index onwards. */
fun remainingAscent(
    points: List<RidePoint>,
    fromIndex: Int,
): Double {
    var ascent = 0.0
    for (i in max(1, fromIndex) until points.size) {
        val delta = points[i].ele - points[i - 1].ele
        if (delta > 0.5) ascent += delta
    }
    return ascent
}

/** Average grade over the next spanM meters, in percent. */
fun upcomingGrade(
    points: List<RidePoint>,
    fromIndex: Int,
    spanM: Int = 200,
): Double {
    val start = points.getOrNull(fromIndex) ?: return 0.0
    var end = start
    for (i in fromIndex until points.size) {
        end = points[i]
        if (points[i].d - start.d >= spanM) break
    }
    val run = end.d - start.d
    if (run < 20) return 0.0
    return (end.ele - start.ele) / run * 100
}

private val COMPASS_LABELS =
    listOf("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")
private val COMPASS_ABBREVIATIONS = listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")

private fun compassIndex(deg: Double): Int = round((deg % 360 + 360) % 360 / 45).toInt() % 8

/** Compass label ("north-east", "south", …) for a bearing in degrees. */
fun compassLabel(deg: Double): String = COMPASS_LABELS[compassIndex(deg)]

/** Abbreviated compass label ("N", "SE", …) for a bearing in degrees. */
fun compassAbbrev(deg: Double): String = COMPASS_ABBREVIATIONS[compassIndex(deg)]

/**
 * Direction of travel along the route at a given index, sampled over spanM
 * meters for stability (more reliable than live GPS heading, which is often
 * null or jittery at cycling speeds). Looks backwards near the end of the
 * route, and returns null if the route is too short or entirely gapped off.
 */
fun routeBearing(
    points: List<RidePoint>,
    index: Int,
    span: Int = 30,
): Double? {
    if (points.size < 2) return null
    val i = index.coerceIn(0, points.size - 1)

    var fwd = i
    val fwdTarget = points[i].d + span
    while (fwd < points.size - 1 && points[fwd].d < fwdTarget && !points[fwd + 1].gap) fwd++
    if (fwd != i) return bearing(points[i].lat, points[i].lon, points[fwd].lat, points[fwd].lon)

    var back = i
    val backTarget = points[i].d - span
    while (back > 0 && points[back].d > backTarget && !points[back].gap) back--
    if (back != i) return bearing(points[back].lat, points[back].lon, points[i].lat, points[i].lon)

    return null
}

enum class WindEffect { HEADWIND, TAILWIND, CROSSWIND }

/**
 * Signed angle from the direction of travel to where the wind is blowing
 * from: 0 = wind straight ahead (headwind), ±180 = wind straight behind
 * (tailwind), ±90 = crosswind.
 */
fun windRelativeAngle(
    travelBearingDeg: Double,
    windFromDeg: Double,
): Double = bearingDelta(travelBearingDeg, windFromDeg)

/** Classifies wind relative to the direction of travel from the signed angle between them. */
fun windEffect(relativeAngleDeg: Double): WindEffect {
    val magnitude = abs(relativeAngleDeg)
    return when {
        magnitude <= 45 -> WindEffect.HEADWIND
        magnitude >= 135 -> WindEffect.TAILWIND
        else -> WindEffect.CROSSWIND
    }
}

/** Component of wind speed along the direction of travel: positive slows the rider down (headwind), negative helps them along (tailwind). */
fun windComponent(
    windSpeedMs: Double,
    relativeAngleDeg: Double,
): Double = windSpeedMs * cos(relativeAngleDeg * PI / 180)
