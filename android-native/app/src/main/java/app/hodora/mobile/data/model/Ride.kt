package app.hodora.mobile.data.model

import app.hodora.mobile.gpx.RidePoint
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Mirrors the `rides` table (supabase/migrations/ at the repo root) — the
 * columns the Phase 1 ride-detail screen needs. `difficulty`/`surface`/
 * `notes`/`cues`/`plan_waypoints`/`plan_profile`/`is_recorded` exist on the
 * real table too but aren't modeled yet; every query below selects columns
 * explicitly rather than `select("*")` so adding those later is additive,
 * not a breaking decode change.
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
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String,
)
