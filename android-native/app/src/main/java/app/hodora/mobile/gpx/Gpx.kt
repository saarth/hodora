package app.hodora.mobile.gpx

import kotlinx.serialization.Serializable
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory
import java.io.StringReader
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Direct port of src/lib/gpx.ts — same algorithms (Ramer-Douglas-Peucker
 * simplification, haversine distance, elevation smoothing), so a route
 * imported here produces the same distance/ascent/point-count the web app
 * would compute from the same file. Keep the two in sync; if you change one,
 * change both.
 */
@Serializable
data class RidePoint(
    val lat: Double,
    val lon: Double,
    val ele: Double,
    /** cumulative distance from the start, in meters */
    val d: Int,
    /** true if this point starts a new segment — a real gap precedes it */
    val gap: Boolean = false,
    /** elapsed seconds since recording start — only set for live-recorded rides */
    val t: Int? = null,
)

data class Bounds(val minLat: Double, val minLon: Double, val maxLat: Double, val maxLon: Double)

data class ParsedRide(
    val name: String,
    val points: List<RidePoint>,
    val distanceM: Double,
    val ascentM: Double,
    val descentM: Double,
    val bounds: Bounds,
)

/** A raw, ungrouped track point straight off the wire — no distance/smoothing/simplification applied yet. */
data class RawTrackPoint(val lat: Double, val lon: Double, val ele: Double, val gap: Boolean, val t: Int? = null)

private const val EARTH_RADIUS_M = 6_371_008.8

fun toRad(deg: Double): Double = deg * PI / 180

fun toDeg(rad: Double): Double = rad * 180 / PI

/** Great-circle distance in meters between two coordinates. */
fun haversine(
    aLat: Double,
    aLon: Double,
    bLat: Double,
    bLon: Double,
): Double {
    val dLat = toRad(bLat - aLat)
    val dLon = toRad(bLon - aLon)
    val lat1 = toRad(aLat)
    val lat2 = toRad(bLat)
    val h = sin(dLat / 2).let { it * it } + cos(lat1) * cos(lat2) * sin(dLon / 2).let { it * it }
    return 2 * EARTH_RADIUS_M * asin(min(1.0, sqrt(h)))
}

/** Initial bearing in degrees (0-360) from a to b. */
fun bearing(
    aLat: Double,
    aLon: Double,
    bLat: Double,
    bLon: Double,
): Double {
    val lat1 = toRad(aLat)
    val lat2 = toRad(bLat)
    val dLon = toRad(bLon - aLon)
    val y = sin(dLon) * cos(lat2)
    val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
    return (toDeg(atan2(y, x)) + 360) % 360
}

/** Signed smallest angle between two bearings, positive = right turn. */
fun bearingDelta(
    from: Double,
    to: Double,
): Double {
    val delta = ((to - from + 540) % 360) - 180
    return if (delta == -180.0) 180.0 else delta
}

/** Splits points into contiguous runs, breaking wherever a point has gap = true. */
fun splitBySegments(points: List<RidePoint>): List<List<RidePoint>> {
    val segments = mutableListOf<List<RidePoint>>()
    var current = mutableListOf<RidePoint>()
    for (p in points) {
        if (p.gap && current.isNotEmpty()) {
            segments.add(current)
            current = mutableListOf()
        }
        current.add(p)
    }
    if (current.isNotEmpty()) segments.add(current)
    return segments
}

private fun smoothElevation(values: List<Double>): List<Double> {
    if (values.size < 5) return values
    val window = 2
    return List(values.size) { i ->
        var sum = 0.0
        var count = 0
        for (j in (i - window)..(i + window)) {
            if (j < 0 || j >= values.size) continue
            sum += values[j]
            count++
        }
        sum / count
    }
}

/** Perpendicular distance in meters from p to the (infinite) line through a and b. */
private fun perpendicularDistanceM(
    p: RidePoint,
    a: RidePoint,
    b: RidePoint,
): Double {
    val cosLat = cos(toRad(a.lat))
    fun toXY(lat: Double, lon: Double) =
        doubleArrayOf(toRad(lon - a.lon) * EARTH_RADIUS_M * cosLat, toRad(lat - a.lat) * EARTH_RADIUS_M)
    val b2 = toXY(b.lat, b.lon)
    val p2 = toXY(p.lat, p.lon)
    val lenSq = b2[0] * b2[0] + b2[1] * b2[1]
    if (lenSq == 0.0) return hypot(p2[0], p2[1])
    val t = (p2[0] * b2[0] + p2[1] * b2[1]) / lenSq
    return hypot(p2[0] - t * b2[0], p2[1] - t * b2[1])
}

/**
 * Ramer-Douglas-Peucker: keeps the points that best preserve the route's
 * shape (corners, turns) and drops the ones that fall within epsilonM of the
 * straight line between their neighbors.
 */
private fun simplifyRDP(
    points: List<RidePoint>,
    epsilonM: Double,
): List<RidePoint> {
    if (points.size <= 2) return points
    val keep = BooleanArray(points.size)
    keep[0] = true
    keep[points.size - 1] = true

    val stack = ArrayDeque<Pair<Int, Int>>()
    stack.addLast(0 to points.size - 1)
    while (stack.isNotEmpty()) {
        val (start, end) = stack.removeLast()
        if (end <= start + 1) continue
        val a = points[start]
        val b = points[end]
        var maxDist = -1.0
        var maxIndex = -1
        for (i in (start + 1) until end) {
            val dist = perpendicularDistanceM(points[i], a, b)
            if (dist > maxDist) {
                maxDist = dist
                maxIndex = i
            }
        }
        if (maxDist > epsilonM) {
            keep[maxIndex] = true
            stack.addLast(start to maxIndex)
            stack.addLast(maxIndex to end)
        }
    }

    return points.filterIndexed { i, _ -> keep[i] }
}

/**
 * Keeps files light: simplifies with RDP, binary-searching the epsilon so
 * the result stays under maxPoints while preserving turn geometry. Runs each
 * segment independently so a real gap between segments is never bridged.
 */
private fun simplify(
    points: List<RidePoint>,
    maxPoints: Int = 2500,
): List<RidePoint> {
    if (points.size <= maxPoints) return points
    val segments = splitBySegments(points)
    fun simplifyAt(epsilonM: Double) = segments.flatMap { simplifyRDP(it, epsilonM) }

    var lo = 0.0
    var hi = 200.0
    var result = simplifyAt(hi)
    while (result.size > maxPoints && hi < 100_000) {
        hi *= 2
        result = simplifyAt(hi)
    }

    var i = 0
    while (i < 25 && hi - lo > 0.5) {
        val mid = (lo + hi) / 2
        val candidate = simplifyAt(mid)
        if (candidate.size > maxPoints) {
            lo = mid
        } else {
            hi = mid
            result = candidate
        }
        i++
    }

    return result
}

/**
 * Shared numeric pipeline (elevation smoothing, distance/ascent/descent
 * accumulation, bounds, RDP simplification) for a raw point list — same as
 * buildParsedRide in gpx.ts.
 */
fun buildParsedRide(
    raw: List<RawTrackPoint>,
    nameFromFile: String,
): ParsedRide {
    require(raw.size >= 2) { "No usable coordinates found in this GPX file." }

    val smoothed = smoothElevation(raw.map { it.ele })

    var distance = 0.0
    var ascent = 0.0
    var descent = 0.0
    var minLat = raw[0].lat
    var maxLat = raw[0].lat
    var minLon = raw[0].lon
    var maxLon = raw[0].lon

    val points =
        raw.mapIndexed { i, p ->
            if (i > 0) {
                val prev = raw[i - 1]
                distance += haversine(prev.lat, prev.lon, p.lat, p.lon)
                val dEle = smoothed[i] - smoothed[i - 1]
                if (dEle > 0.5) ascent += dEle else if (dEle < -0.5) descent += -dEle
            }
            minLat = min(minLat, p.lat)
            maxLat = maxOf(maxLat, p.lat)
            minLon = min(minLon, p.lon)
            maxLon = maxOf(maxLon, p.lon)
            RidePoint(
                lat = p.lat,
                lon = p.lon,
                ele = round(smoothed[i] * 10) / 10,
                d = round(distance).toInt(),
                gap = p.gap,
                t = p.t,
            )
        }

    return ParsedRide(
        name = nameFromFile.take(120),
        points = simplify(points),
        distanceM = distance,
        ascentM = ascent,
        descentM = descent,
        bounds = Bounds(minLat, minLon, maxLat, maxLon),
    )
}

/**
 * Total ascent/descent for points that already have real elevation (a
 * routed path, a recorded ride) — same 0.5m noise threshold as
 * buildParsedRide, but without the smoothing/RDP pipeline.
 */
fun computeAscentDescent(points: List<RidePoint>): Pair<Double, Double> {
    var ascentM = 0.0
    var descentM = 0.0
    for (i in 1 until points.size) {
        val delta = points[i].ele - points[i - 1].ele
        if (delta > 0.5) ascentM += delta else if (delta < -0.5) descentM += -delta
    }
    return ascentM to descentM
}

private data class RawXmlPoint(val lat: Double, val lon: Double, val ele: Double, val segIndex: Int)

/**
 * Streams the GPX XML once, collecting `<trkpt>` grouped by `<trkseg>`
 * (falling back to `<rtept>` as a single implicit segment, matching
 * parseGpx in gpx.ts) plus the first `<name>` element's text.
 *
 * NB: assumes each element's text arrives as a single TEXT event, which
 * holds for the plain `<ele>123.4</ele>` / `<name>Foo</name>` shape every
 * GPX exporter in the wild produces; if a real-world file trips this up,
 * accumulate across repeated TEXT events instead of overwriting.
 */
private fun parseGpxDocument(xml: String): Pair<List<RawXmlPoint>, String?> {
    val factory = XmlPullParserFactory.newInstance()
    factory.isNamespaceAware = false
    val parser = factory.newPullParser()
    parser.setInput(StringReader(xml))

    val trkpts = mutableListOf<RawXmlPoint>()
    val rtepts = mutableListOf<RawXmlPoint>()
    var name: String? = null

    var segIndex = -1
    var inPointTag: String? = null
    var curLat = Double.NaN
    var curLon = Double.NaN
    var curEle = 0.0
    var inEle = false
    var inName = false

    var eventType = parser.eventType
    while (eventType != XmlPullParser.END_DOCUMENT) {
        when (eventType) {
            XmlPullParser.START_TAG ->
                when (parser.name) {
                    "trkseg" -> segIndex++
                    "trkpt", "rtept" -> {
                        inPointTag = parser.name
                        curLat = parser.getAttributeValue(null, "lat")?.toDoubleOrNull() ?: Double.NaN
                        curLon = parser.getAttributeValue(null, "lon")?.toDoubleOrNull() ?: Double.NaN
                        curEle = 0.0
                    }
                    "ele" -> if (inPointTag != null) inEle = true
                    "name" -> if (name == null) inName = true
                }
            XmlPullParser.TEXT ->
                if (inEle) {
                    parser.text?.trim()?.toDoubleOrNull()?.let { curEle = it }
                } else if (inName) {
                    name = parser.text?.trim()
                }
            XmlPullParser.END_TAG ->
                when (parser.name) {
                    "ele" -> inEle = false
                    "name" -> inName = false
                    "trkpt" -> {
                        if (curLat.isFinite() && curLon.isFinite()) {
                            trkpts.add(RawXmlPoint(curLat, curLon, curEle, segIndex.coerceAtLeast(0)))
                        }
                        inPointTag = null
                    }
                    "rtept" -> {
                        if (curLat.isFinite() && curLon.isFinite()) {
                            rtepts.add(RawXmlPoint(curLat, curLon, curEle, 0))
                        }
                        inPointTag = null
                    }
                }
        }
        eventType = parser.next()
    }

    return trkpts.ifEmpty { rtepts } to name
}

/** Parses GPX XML into a ParsedRide, ready to hand to RidesRepository.createRide. */
fun parseGpx(
    xml: String,
    fallbackName: String,
): ParsedRide {
    val (rawPoints, nameFromFile) =
        try {
            parseGpxDocument(xml)
        } catch (e: Exception) {
            throw IllegalArgumentException("That file isn't valid GPX.", e)
        }
    require(rawPoints.size >= 2) { "No track points found in this GPX file." }

    val raw = mutableListOf<RawTrackPoint>()
    var prevSeg = -1
    for (p in rawPoints) {
        raw.add(RawTrackPoint(p.lat, p.lon, p.ele, gap = raw.isNotEmpty() && p.segIndex != prevSeg))
        prevSeg = p.segIndex
    }

    val name = nameFromFile?.takeIf { it.isNotBlank() } ?: fallbackName
    return buildParsedRide(raw, name)
}

private fun escapeXml(value: String): String =
    value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;")

/**
 * Serializes a ride's points back to a GPX 1.1 string — the inverse of
 * parseGpx/buildParsedRide, splitting into one `<trkseg>` per
 * splitBySegments run so a real gap round-trips.
 */
fun toGpx(
    name: String,
    points: List<RidePoint>,
): String {
    val trksegs =
        splitBySegments(points).joinToString("\n") { segment ->
            val trkpts =
                segment.joinToString("\n") { p ->
                    "      <trkpt lat=\"${p.lat}\" lon=\"${p.lon}\"><ele>${p.ele}</ele></trkpt>"
                }
            "    <trkseg>\n$trkpts\n    </trkseg>"
        }

    return listOf(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<gpx version=\"1.1\" creator=\"Hodora\" xmlns=\"http://www.topografix.com/GPX/1/1\">",
        "  <trk>",
        "    <name>${escapeXml(name)}</name>",
        trksegs,
        "  </trk>",
        "</gpx>",
        "",
    ).joinToString("\n")
}

fun formatDistance(
    meters: Double,
    metric: Boolean = true,
): String {
    if (metric) {
        if (meters < 1000) return "${round(meters).toInt()} m"
        val km = meters / 1000
        return "%.${if (meters < 10_000) 2 else 1}f km".format(km)
    }
    val miles = meters / 1609.344
    if (miles < 0.2) return "${round(meters * 3.28084).toInt()} ft"
    return "%.${if (miles < 10) 2 else 1}f mi".format(miles)
}

fun formatElevation(
    meters: Double,
    metric: Boolean = true,
): String = if (metric) "${round(meters).toInt()} m" else "${round(meters * 3.28084).toInt()} ft"

fun formatDuration(seconds: Double): String {
    if (!seconds.isFinite() || seconds <= 0) return "--"
    val h = (seconds / 3600).toInt()
    val m = round((seconds % 3600) / 60).toInt()
    return if (h > 0) "${h}h ${m.toString().padStart(2, '0')}m" else "$m min"
}

fun formatSpeed(
    mps: Double,
    metric: Boolean = true,
): String {
    if (!mps.isFinite() || mps <= 0) return "0.0"
    return "%.1f".format(mps * (if (metric) 3.6 else 2.236936))
}

/** Google Maps directions link from the rider's current location to a point, e.g. a route's start. */
fun directionsUrl(
    lat: Double,
    lon: Double,
): String = "https://www.google.com/maps/dir/?api=1&destination=$lat,$lon&travelmode=bicycling"
