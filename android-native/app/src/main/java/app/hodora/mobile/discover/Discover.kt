package app.hodora.mobile.discover

import app.hodora.mobile.gpx.computeAscentDescent
import app.hodora.mobile.gpx.haversine
import app.hodora.mobile.gpx.toDeg
import app.hodora.mobile.gpx.toRad
import app.hodora.mobile.net.HttpClientProvider
import app.hodora.mobile.routing.BikeProfile
import app.hodora.mobile.routing.LatLon
import app.hodora.mobile.routing.fetchRoute
import app.hodora.mobile.routing.pathLengthM
import app.hodora.mobile.routing.toRidePoints
import io.ktor.client.request.forms.submitForm
import io.ktor.client.statement.bodyAsText
import io.ktor.http.Parameters
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Direct port of src/lib/discover.ts: finds signposted cycle routes from
 * OpenStreetMap (Overpass) and generates loop rides with a cycling router.
 * All client-side — no keys. boundsOf/toRidePoints are already ported (see
 * routing/Routing.kt's doc comments — they were pulled over early since the
 * planner needed the same shapes); only the Overpass lookup and loop
 * generator are new here.
 */
enum class DiscoveredRouteKind { OSM, LOOP }

data class DiscoveredRoute(
    val id: String,
    val name: String,
    val kind: DiscoveredRouteKind,
    /** e.g. "Regional network" or "Generated loop from your start point" */
    val subtitle: String,
    val path: List<LatLon>,
    val distanceM: Double,
    /** total climbing in meters, when the source had real elevation (generated loops via BRouter) — 0 for signposted OSM routes, which have none */
    val ascentM: Double,
)

private const val OVERPASS_PRIMARY = "https://overpass-api.de/api/interpreter"
private const val OVERPASS_FALLBACK = "https://overpass.kumi.systems/api/interpreter"

private val NETWORK_LABEL =
    mapOf(
        "icn" to "International network",
        "ncn" to "National network",
        "rcn" to "Regional network",
        "lcn" to "Local network",
    )

private val json = Json { ignoreUnknownKeys = true }

@Serializable
private data class OverpassResponse(val elements: List<OverpassElement> = emptyList())

@Serializable
private data class OverpassElement(
    val type: String,
    val id: Long,
    val tags: Map<String, String>? = null,
    val members: List<OverpassMember>? = null,
)

@Serializable
private data class OverpassMember(val type: String, val geometry: List<OverpassLatLon>? = null)

@Serializable
private data class OverpassLatLon(val lat: Double, val lon: Double)

/** Stitch relation member ways into one continuous-ish polyline. */
private fun stitch(members: List<OverpassMember>?): List<LatLon> {
    val segments =
        (members ?: emptyList())
            .filter { it.type == "way" && (it.geometry?.size ?: 0) > 1 }
            .map { member -> member.geometry!!.map { LatLon(it.lat, it.lon) } }
    if (segments.isEmpty()) return emptyList()

    val remaining = segments.drop(1).toMutableList()
    val path = segments[0].toMutableList()
    while (remaining.isNotEmpty()) {
        val tail = path.last()
        var bestIndex = 0
        var bestDistance = Double.POSITIVE_INFINITY
        var flip = false
        remaining.forEachIndexed { index, segment ->
            val start = haversine(tail.lat, tail.lon, segment.first().lat, segment.first().lon)
            val end = haversine(tail.lat, tail.lon, segment.last().lat, segment.last().lon)
            val distance = min(start, end)
            if (distance < bestDistance) {
                bestDistance = distance
                bestIndex = index
                flip = end < start
            }
        }
        // A gap larger than 2 km means the rest belongs to a detached branch.
        if (bestDistance > 2000) break
        val next = remaining.removeAt(bestIndex)
        path.addAll(if (flip) next.reversed() else next)
    }
    return path
}

private suspend fun overpass(query: String): OverpassResponse {
    var lastError: Exception? = null
    for (endpoint in listOf(OVERPASS_PRIMARY, OVERPASS_FALLBACK)) {
        try {
            val response =
                HttpClientProvider.client.submitForm(
                    url = endpoint,
                    formParameters = Parameters.build { append("data", query) },
                )
            if (!response.status.isSuccess()) error("Overpass ${response.status.value}")
            return json.decodeFromString<OverpassResponse>(response.bodyAsText())
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            lastError = e
        }
    }
    throw lastError ?: Exception("Overpass unavailable")
}

/** Signposted cycle routes whose ways pass near the given centre. */
suspend fun findNearbyRoutes(
    center: LatLon,
    radiusM: Double,
): List<DiscoveredRoute> {
    val radius = radiusM.coerceIn(2000.0, 40000.0).roundToInt()
    val query =
        """
        [out:json][timeout:40];
        relation["route"="bicycle"]["name"](around:$radius,${"%.5f".format(center.lat)},${"%.5f".format(center.lon)});
        out geom 40;
        """.trimIndent()
    val data = overpass(query)

    val routes = mutableListOf<DiscoveredRoute>()
    for (element in data.elements) {
        if (element.type != "relation") continue
        val path = stitch(element.members)
        if (path.size < 2) continue
        val distanceM = pathLengthM(path)
        // Skip tiny connector segments — they aren't rides.
        if (distanceM < 5000) continue
        val tags = element.tags ?: emptyMap()
        val network = tags["network"] ?: ""
        routes.add(
            DiscoveredRoute(
                id = "osm-${element.id}",
                name = tags["name"] ?: "Unnamed cycle route",
                kind = DiscoveredRouteKind.OSM,
                subtitle = NETWORK_LABEL[network] ?: tags["operator"] ?: "Signposted cycle route",
                path = path,
                distanceM = distanceM,
                ascentM = 0.0,
            ),
        )
    }
    return routes.sortedByDescending { it.distanceM }.take(12)
}

private fun offset(
    center: LatLon,
    bearingDeg: Double,
    distanceM: Double,
): LatLon {
    val earthRadiusM = 6_371_000.0
    val bearing = toRad(bearingDeg)
    val lat1 = toRad(center.lat)
    val lon1 = toRad(center.lon)
    val angular = distanceM / earthRadiusM
    val lat2 = asin(sin(lat1) * cos(angular) + cos(lat1) * sin(angular) * cos(bearing))
    val lon2 = lon1 + atan2(sin(bearing) * sin(angular) * cos(lat1), cos(angular) - sin(lat1) * sin(lat2))
    return LatLon(toDeg(lat2), toDeg(lon2))
}

private fun compass(bearingDeg: Double): String {
    val names = listOf("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west")
    return names[Math.round((bearingDeg % 360) / 45).toInt() % 8]
}

/**
 * Loop rides of roughly the requested length, starting and finishing at
 * [start]. Each loop heads out on a different bearing. Unlike the web
 * version there's no explicit AbortSignal plumbing — Kotlin's structured
 * concurrency already cancels the in-flight `async` calls below for free
 * when the caller's own coroutine (e.g. a ViewModel's viewModelScope) is
 * cancelled, which is the same effect discover.ts's `signal` param exists
 * to get on the web.
 */
suspend fun generateLoops(
    start: LatLon,
    targetM: Double,
    count: Int = 3,
): List<DiscoveredRoute> =
    coroutineScope {
        // Triangle-ish loop: three waypoints on a circle sized so the ridden
        // distance lands near the target.
        val radius = (targetM / (2 * Math.PI)) * 0.9
        val bearings = List(count) { index -> (360.0 / count) * index + 20 }

        val deferred =
            bearings.mapIndexed { index, bearing ->
                async {
                    val waypoints =
                        listOf(
                            start,
                            offset(start, bearing, radius),
                            offset(start, bearing + 120, radius),
                            offset(start, bearing + 240, radius),
                            start,
                        )
                    // BRouter first (its geometry carries elevation, unlike
                    // OSRM's) with OSRM as the automatic fallback fetchRoute
                    // already provides — same resilience as /plan, just
                    // without a profile choice to honor here.
                    val routed = fetchRoute(waypoints, BikeProfile.TREKKING, preferBrouter = true)
                    // If both routers are down, fetchRoute would otherwise
                    // return a straight-line polygon instead of throwing —
                    // reject that explicitly so this bearing is dropped
                    // below, rather than showing a fake "loop" that ignores
                    // roads.
                    if (!routed.routed) error("No route found for this bearing")
                    val (ascentM, _) = computeAscentDescent(toRidePoints(routed.path))
                    DiscoveredRoute(
                        id = "loop-$index",
                        name = "${Math.round(routed.distanceM / 1000)} km loop · ${compass(bearing)}",
                        kind = DiscoveredRouteKind.LOOP,
                        subtitle = "Generated loop from your start point",
                        path = routed.path,
                        distanceM = routed.distanceM,
                        ascentM = ascentM,
                    )
                }
            }

        deferred.mapNotNull { runCatching { it.await() }.getOrNull() }
    }
