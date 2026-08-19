package app.hodora.mobile.routing

import app.hodora.mobile.cues.RideCue
import app.hodora.mobile.cues.osrmDirection
import app.hodora.mobile.gpx.Bounds
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.gpx.haversine
import app.hodora.mobile.net.HttpClientProvider
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.isSuccess
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

/**
 * Direct port of src/lib/routing.ts: turns a list of waypoints into a real
 * cycling path via public OSM routers, client-side, no keys required. Same
 * endpoints, same fallback order, same straight-line-if-both-fail behavior.
 */
@Serializable
data class LatLon(
    val lat: Double,
    val lon: Double,
    /** elevation in meters, when the router's geometry included one (BRouter only — OSRM doesn't) */
    val ele: Double? = null,
)

/** BRouter profile names, as accepted by the public/self-hosted BRouter server. */
@Serializable
enum class BikeProfile(val apiValue: String, val label: String, val description: String) {
    @SerialName("trekking")
    TREKKING("trekking", "Trekking", "Balanced, all-around cycling route"),

    @SerialName("fastbike")
    FASTBIKE("fastbike", "Fast", "Prefers direct roads for speed"),

    @SerialName("safety")
    SAFETY("safety", "Safety", "Prefers quieter, bike-friendly ways"),
}

data class RoutedPath(
    /** the path through all waypoints, following real ways when possible */
    val path: List<LatLon>,
    /** length of that path in meters */
    val distanceM: Double,
    /** true when the geometry comes from a cycling router, false for the straight-line fallback */
    val routed: Boolean,
    /** turn-by-turn step instructions the router provided, if any */
    val cues: List<RideCue>,
)

private const val OSRM_BIKE = "https://routing.openstreetmap.de/routed-bike/route/v1/bike"

// Same zero-config public default as the web app (VITE_BROUTER_URL lets
// self-hosters override it there); not yet plumbed through to a settings
// screen here.
private const val BROUTER_DEFAULT = "https://brouter.de/brouter"

private val json = Json { ignoreUnknownKeys = true; isLenient = true }

fun pathLengthM(path: List<LatLon>): Double {
    var total = 0.0
    for (i in 1 until path.size) {
        total += haversine(path[i - 1].lat, path[i - 1].lon, path[i].lat, path[i].lon)
    }
    return total
}

private fun toLatLonPath(coordinates: List<List<Double>>): List<LatLon> =
    coordinates.map { c -> LatLon(lat = c[1], lon = c[0], ele = c.getOrNull(2)) }

/**
 * Converts a routed path back into a ride's point list — port of
 * toRidePoints in src/lib/discover.ts (used by both the route planner and
 * the loop generator on web; only the planner is ported so far). Unlike
 * gpx.ts's buildParsedRide, the web version leaves `d` as an unrounded
 * float; rounding it to match RidePoint.d's Int type here only costs
 * sub-meter precision.
 */
fun toRidePoints(path: List<LatLon>): List<RidePoint> {
    var d = 0.0
    return path.mapIndexed { index, point ->
        if (index > 0) {
            d += haversine(path[index - 1].lat, path[index - 1].lon, point.lat, point.lon)
        }
        RidePoint(lat = point.lat, lon = point.lon, ele = point.ele ?: 0.0, d = Math.round(d).toInt())
    }
}

/** Port of boundsOf in src/lib/discover.ts. */
fun boundsOf(path: List<LatLon>): Bounds {
    require(path.isNotEmpty()) { "Can't compute bounds of an empty path" }
    return Bounds(
        minLat = path.minOf { it.lat },
        minLon = path.minOf { it.lon },
        maxLat = path.maxOf { it.lat },
        maxLon = path.maxOf { it.lon },
    )
}

/** Raw result from a single router call — fetchRoute wraps this into the public RoutedPath (adding `routed = true`). */
data class RouteResult(val path: List<LatLon>, val distanceM: Double, val cues: List<RideCue>)

@Serializable
private data class OsrmResponse(val routes: List<OsrmRoute> = emptyList())

@Serializable
private data class OsrmRoute(
    val distance: Double = 0.0,
    val geometry: OsrmGeometry? = null,
    val legs: List<OsrmLeg> = emptyList(),
)

@Serializable
private data class OsrmGeometry(val coordinates: List<List<Double>> = emptyList())

@Serializable
private data class OsrmLeg(val steps: List<OsrmStep> = emptyList())

@Serializable
private data class OsrmStep(
    val distance: Double = 0.0,
    val name: String? = null,
    val maneuver: OsrmManeuver? = null,
)

@Serializable
private data class OsrmManeuver(val type: String? = null, val modifier: String? = null)

/**
 * Walks an OSRM route's legs/steps into a flat cue list with cumulative
 * distance offsets, so a multi-waypoint route gets one continuous
 * instruction list instead of restarting at zero for every leg.
 */
private fun parseOsrmSteps(route: OsrmRoute): List<RideCue> {
    val cues = mutableListOf<RideCue>()
    var offsetM = 0.0
    for (leg in route.legs) {
        for (step in leg.steps) {
            step.maneuver?.let { maneuver ->
                cues.add(
                    RideCue(
                        atM = offsetM,
                        direction = osrmDirection(maneuver.type.orEmpty(), maneuver.modifier),
                        name = step.name?.trim()?.takeIf { it.isNotEmpty() },
                    ),
                )
            }
            offsetM += step.distance
        }
    }
    return cues
}

/** Routes through every waypoint in order via the public OSRM bike server, capturing turn-by-turn step instructions along the way. */
suspend fun fetchOsrmRoute(points: List<LatLon>): RouteResult {
    val coords = points.joinToString(";") { "${it.lon},${it.lat}" }
    val response = HttpClientProvider.client.get("$OSRM_BIKE/$coords?overview=full&geometries=geojson&steps=true")
    if (!response.status.isSuccess()) error("OSRM ${response.status.value}")
    val route = json.decodeFromString<OsrmResponse>(response.bodyAsText()).routes.firstOrNull() ?: error("OSRM: no route")
    val coordinates = route.geometry?.coordinates.orEmpty()
    if (coordinates.size < 2) error("OSRM: no geometry")
    return RouteResult(path = toLatLonPath(coordinates), distanceM = route.distance, cues = parseOsrmSteps(route))
}

@Serializable
private data class BrouterResponse(val features: List<BrouterFeature> = emptyList())

@Serializable
private data class BrouterFeature(
    val geometry: BrouterGeometry? = null,
    val properties: JsonObject? = null,
)

@Serializable
private data class BrouterGeometry(val coordinates: List<List<Double>> = emptyList())

/**
 * Routes through every waypoint in order via BRouter, respecting the chosen
 * cycling profile. Doesn't return cues: BRouter's public server has no
 * documented, stable step-instruction format to parse (unlike OSRM's
 * steps=true), so a route from here falls back to geometry-detected turns
 * for its cue sheet at nav time instead (Phase 3), same as on web.
 */
suspend fun fetchBrouterRoute(
    points: List<LatLon>,
    profile: BikeProfile,
): RouteResult {
    val lonlats = points.joinToString("|") { "${it.lon},${it.lat}" }
    val url = "$BROUTER_DEFAULT?lonlats=$lonlats&profile=${profile.apiValue}&alternativeidx=0&format=geojson"
    val response = HttpClientProvider.client.get(url)
    if (!response.status.isSuccess()) error("BRouter ${response.status.value}")
    val feature = json.decodeFromString<BrouterResponse>(response.bodyAsText()).features.firstOrNull()
        ?: error("BRouter: no geometry")
    val coordinates = feature.geometry?.coordinates.orEmpty()
    if (coordinates.size < 2) error("BRouter: no geometry")
    val path = toLatLonPath(coordinates)
    // "track-length" comes back as either a JSON string or number depending
    // on the BRouter build; reading it as a raw JsonPrimitive (rather than a
    // typed field) is robust to either — jsonPrimitive.content works for both.
    val declared = feature.properties?.get("track-length")?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()
    return RouteResult(path = path, distanceM = declared ?: pathLengthM(path), cues = emptyList())
}

/**
 * Bike-friendly route through the given waypoints (in order), trying one
 * router then the other. Falls back to straight lines between waypoints
 * when both routers are unreachable.
 *
 * `preferBrouter` puts BRouter first so the requested profile is actually
 * honored — OSRM's public bike profile is fixed and ignores it.
 */
suspend fun fetchRoute(
    points: List<LatLon>,
    profile: BikeProfile = BikeProfile.TREKKING,
    preferBrouter: Boolean = false,
): RoutedPath {
    if (points.size < 2) return RoutedPath(points, pathLengthM(points), routed = false, cues = emptyList())

    val attempts: List<suspend () -> RouteResult> =
        if (preferBrouter) {
            listOf({ fetchBrouterRoute(points, profile) }, { fetchOsrmRoute(points) })
        } else {
            listOf({ fetchOsrmRoute(points) }, { fetchBrouterRoute(points, profile) })
        }

    for (attempt in attempts) {
        try {
            val result = attempt()
            return RoutedPath(result.path, result.distanceM, routed = true, cues = result.cues)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // try the next router
        }
    }
    return RoutedPath(points, pathLengthM(points), routed = false, cues = emptyList())
}

/**
 * Bike-friendly path from the rider back to the track — port of
 * fetchCyclingRoute in src/lib/rejoin.ts. Deliberately doesn't pass
 * preferBrouter: unlike the planner, speed matters more than profile choice
 * once the rider is already off track, so this takes fetchRoute's default
 * OSRM-first order.
 */
suspend fun fetchCyclingRoute(
    from: LatLon,
    to: LatLon,
): RoutedPath = fetchRoute(listOf(from, to))
