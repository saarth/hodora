package app.hodora.mobile.data.model

import app.hodora.mobile.cues.RideCue
import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.routing.BikeProfile
import app.hodora.mobile.routing.LatLon
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Insert payload for a new `rides` row — user_id is filled in by RidesRepository from the current session. */
@Serializable
data class NewRide(
    @SerialName("user_id") val userId: String,
    val name: String,
    @SerialName("source_filename") val sourceFilename: String?,
    @SerialName("distance_m") val distanceM: Int,
    @SerialName("ascent_m") val ascentM: Int,
    @SerialName("descent_m") val descentM: Int,
    @SerialName("min_lat") val minLat: Double?,
    @SerialName("min_lon") val minLon: Double?,
    @SerialName("max_lat") val maxLat: Double?,
    @SerialName("max_lon") val maxLon: Double?,
    val points: List<RidePoint>,
    /** router-provided turn-by-turn instructions — empty for a GPX import, may be non-empty for a planned route (OSRM only; BRouter never returns cues, see routing/Routing.kt). */
    val cues: List<RideCue> = emptyList(),
    /** waypoints tapped on the planner, kept so a planned route can be reopened and re-routed — null for imported rides. */
    @SerialName("plan_waypoints") val planWaypoints: List<LatLon>? = null,
    /** BRouter profile used when this route was planned — null unless planWaypoints is set. */
    @SerialName("plan_profile") val planProfile: BikeProfile? = null,
)

@Serializable
data class RideId(val id: String)
