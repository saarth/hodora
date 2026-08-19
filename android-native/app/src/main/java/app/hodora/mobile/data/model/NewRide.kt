package app.hodora.mobile.data.model

import app.hodora.mobile.gpx.RidePoint
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
)

@Serializable
data class RideId(val id: String)
