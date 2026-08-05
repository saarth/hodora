package com.hodora.app.data.gpx

import com.hodora.app.data.model.ParsedRide
import com.hodora.app.data.model.RideBounds
import com.hodora.app.data.model.RidePoint
import java.io.InputStream
import kotlin.math.roundToInt
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserFactory

class GpxParseException(message: String) : Exception(message)

private data class RawPoint(val lat: Double, val lon: Double, val ele: Double)

/**
 * Port of `parseGpx` in src/lib/gpx.ts. Streams the file with XmlPullParser
 * (vs. the web version's DOMParser) but preserves the exact same algorithm:
 * segment/gap detection, 5-point elevation smoothing, 0.5m ascent/descent
 * dead-band, and RDP simplification above 2500 points.
 */
object GpxParser {

    fun parse(input: InputStream, fallbackName: String): ParsedRide {
        val segments = mutableListOf<MutableList<RawPoint>>()
        val allTrkpts = mutableListOf<RawPoint>()
        val allRtepts = mutableListOf<RawPoint>()
        var rawPointCount = 0
        var name: String? = null

        val pathStack = ArrayDeque<String>()
        var currentSegment: MutableList<RawPoint>? = null
        var sawTrkseg = false

        // Point currently being parsed (attributes read on <trkpt>/<rtept> start, <ele> filled on its end tag)
        var pendingLat = Double.NaN
        var pendingLon = Double.NaN
        var pendingEle = 0.0
        var pendingValid = false
        var inNameTag = false
        var nameBuffer = StringBuilder()

        try {
            val factory = XmlPullParserFactory.newInstance()
            factory.isNamespaceAware = false
            val parser: XmlPullParser = factory.newPullParser()
            parser.setInput(input, null)

            var eventType = parser.eventType
            while (eventType != XmlPullParser.END_DOCUMENT) {
                when (eventType) {
                    XmlPullParser.START_TAG -> {
                        val tag = parser.name.substringAfterLast(':').lowercase()
                        pathStack.addLast(tag)

                        when (tag) {
                            "trkseg" -> {
                                sawTrkseg = true
                                currentSegment = mutableListOf()
                                segments += currentSegment!!
                            }
                            "trkpt", "rtept" -> {
                                rawPointCount++
                                pendingLat = parser.getAttributeValue(null, "lat")?.toDoubleOrNull() ?: Double.NaN
                                pendingLon = parser.getAttributeValue(null, "lon")?.toDoubleOrNull() ?: Double.NaN
                                pendingEle = 0.0
                                pendingValid = pendingLat.isFinite() && pendingLon.isFinite()
                            }
                            "name" -> {
                                // Only the first <name> under <trk> or <metadata> is the route name —
                                // ignore <wpt>/<trkpt>/<rtept> child <name> tags (waypoint labels).
                                val parent = pathStack.getOrNull(pathStack.size - 2)
                                if (name == null && (parent == "trk" || parent == "metadata")) {
                                    inNameTag = true
                                    nameBuffer = StringBuilder()
                                }
                            }
                        }
                    }
                    XmlPullParser.TEXT -> {
                        if (inNameTag) {
                            nameBuffer.append(parser.text)
                        } else if (pathStack.lastOrNull() == "ele") {
                            val parent = pathStack.getOrNull(pathStack.size - 2)
                            if (parent == "trkpt" || parent == "rtept") {
                                parser.text.trim().toDoubleOrNull()?.let { if (it.isFinite()) pendingEle = it }
                            }
                        }
                    }
                    XmlPullParser.END_TAG -> {
                        val tag = pathStack.removeLastOrNull()
                        when (tag) {
                            "trkpt" -> {
                                if (pendingValid) {
                                    val point = RawPoint(pendingLat, pendingLon, pendingEle)
                                    currentSegment?.add(point)
                                    allTrkpts += point
                                }
                            }
                            "rtept" -> {
                                if (pendingValid) allRtepts += RawPoint(pendingLat, pendingLon, pendingEle)
                            }
                            "name" -> {
                                if (inNameTag) {
                                    name = nameBuffer.toString().trim().ifEmpty { null }
                                    inNameTag = false
                                }
                            }
                            "trkseg" -> currentSegment = null
                        }
                    }
                }
                eventType = parser.next()
            }
        } catch (e: GpxParseException) {
            throw e
        } catch (e: Exception) {
            throw GpxParseException("That file isn't valid GPX.")
        }

        if (rawPointCount < 2) {
            throw GpxParseException("No track points found in this GPX file.")
        }

        val rawSegments: List<List<RawPoint>> = when {
            sawTrkseg && segments.any { it.isNotEmpty() } -> segments
            allTrkpts.isNotEmpty() -> listOf(allTrkpts)
            else -> listOf(allRtepts)
        }

        // Flatten, marking gap=true whenever the segment index changes from the previous point.
        data class Flat(val raw: RawPoint, val gap: Boolean)
        val flat = mutableListOf<Flat>()
        rawSegments.forEachIndexed { si, seg ->
            seg.forEachIndexed { pi, raw ->
                val gap = pi == 0 && si != 0
                flat += Flat(raw, gap)
            }
        }

        if (flat.size < 2) {
            throw GpxParseException("No usable coordinates found in this GPX file.")
        }

        // 5-point moving-average elevation smoothing (window radius 2, boundary-clamped).
        val rawEle = flat.map { it.raw.ele }
        val smoothedEle = if (rawEle.size < 5) {
            rawEle
        } else {
            List(rawEle.size) { i ->
                val lo = (i - 2).coerceAtLeast(0)
                val hi = (i + 2).coerceAtMost(rawEle.size - 1)
                var sum = 0.0
                for (j in lo..hi) sum += rawEle[j]
                sum / (hi - lo + 1)
            }
        }

        var distance = 0.0
        var ascent = 0.0
        var descent = 0.0
        var minLat = Double.POSITIVE_INFINITY
        var minLon = Double.POSITIVE_INFINITY
        var maxLat = Double.NEGATIVE_INFINITY
        var maxLon = Double.NEGATIVE_INFINITY

        val outPoints = ArrayList<RidePoint>(flat.size)
        for (i in flat.indices) {
            val p = flat[i].raw
            if (i > 0) {
                val prev = flat[i - 1].raw
                distance += GeoMath.haversine(prev.lat, prev.lon, p.lat, p.lon)
                val dEle = smoothedEle[i] - smoothedEle[i - 1]
                if (dEle > 0.5) ascent += dEle
                if (dEle < -0.5) descent += -dEle
            }
            if (p.lat < minLat) minLat = p.lat
            if (p.lat > maxLat) maxLat = p.lat
            if (p.lon < minLon) minLon = p.lon
            if (p.lon > maxLon) maxLon = p.lon

            outPoints += RidePoint(
                lat = p.lat,
                lon = p.lon,
                ele = Math.round(p.ele * 10) / 10.0,
                d = distance.roundToInt().toDouble(),
                gap = flat[i].gap,
            )
        }

        val finalName = (name ?: fallbackName).take(120)

        val simplified = if (outPoints.size > GpxSimplifier.MAX_POINTS) {
            GpxSimplifier.simplify(outPoints, GpxSimplifier.MAX_POINTS)
        } else {
            outPoints
        }

        return ParsedRide(
            name = finalName,
            points = simplified,
            distanceM = distance,
            ascentM = ascent,
            descentM = descent,
            bounds = RideBounds(minLat, minLon, maxLat, maxLon),
        )
    }
}
