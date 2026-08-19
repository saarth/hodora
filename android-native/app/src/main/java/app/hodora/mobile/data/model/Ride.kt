package app.hodora.mobile.data.model

import app.hodora.mobile.cues.RideCue
import app.hodora.mobile.gpx.RidePoint
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A rider-authored note pinned along the route (JSON shape stored in the
 * `notes` JSONB column — camelCase keys as written, no snake_case mapping
 * needed here since Postgres never sees inside the JSONB blob).
 */
@Serializable
data class RideNote(
    val id: String,
    /** cumulative route distance in meters where the note sits */
    val distanceM: Double,
    val lat: Double,
    val lon: Double,
    val text: String,
    val createdAt: String,
)

/**
 * Mirrors the `rides` table (supabase/migrations/ at the repo root) — the
 * columns the app needs so far. `difficulty`/`surface`/`plan_waypoints`/
 * `plan_profile`/`is_recorded` exist on the real table too but aren't
 * modeled yet; every query below selects columns explicitly rather than
 * `select("*")` so adding those later is additive, not a breaking decode
 * change.
 */
@Serializable
data class Ride(
    val id: String,
    val name: String,
    val description: String? = null,
    @SerialName("source_filename") val sourceFilename: String? = null,
    @SerialName("distance_m") val distanceM: Double = 0.0,
    @SerialName("ascent_m") val ascentM: Double = 0.0,
    @SerialName("descent_m") val descentM: Double = 0.0,
    @SerialName("min_lat") val minLat: Double? = null,
    @SerialName("min_lon") val minLon: Double? = null,
    @SerialName("max_lat") val maxLat: Double? = null,
    @SerialName("max_lon") val maxLon: Double? = null,
    val points: List<RidePoint> = emptyList(),
    /** router-provided turn-by-turn instructions, if any — NavigationService falls back to geometry-detected turns (buildCueSheet) when empty. */
    val cues: List<RideCue> = emptyList(),
    /** rider-authored notes pinned along the route — NavigationService alerts as the rider approaches one (findProximityAlert). */
    val notes: List<RideNote> = emptyList(),
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
)
