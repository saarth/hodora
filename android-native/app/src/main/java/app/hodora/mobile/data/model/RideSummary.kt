package app.hodora.mobile.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Mirrors a subset of the `rides` table (supabase/migrations/ at the repo
 * root) — the columns the rides list screen needs. Deliberately excludes
 * `points` (the full GPX point array): that's a lot of JSON to pull down
 * for a list row, and only the ride detail screen (Phase 1) needs it.
 */
@Serializable
data class RideSummary(
    val id: String,
    val name: String,
    val description: String? = null,
    @SerialName("distance_m") val distanceM: Double = 0.0,
    @SerialName("ascent_m") val ascentM: Double = 0.0,
    @SerialName("descent_m") val descentM: Double = 0.0,
    @SerialName("created_at") val createdAt: String,
)
