package app.hodora.mobile.data.repository

import app.hodora.mobile.data.local.OfflineStore
import app.hodora.mobile.data.model.NewRide
import app.hodora.mobile.data.model.Ride
import app.hodora.mobile.data.model.RideId
import app.hodora.mobile.data.model.RideSummary
import app.hodora.mobile.data.supabase.SupabaseModule
import app.hodora.mobile.cues.RideCue
import app.hodora.mobile.gpx.ParsedRide
import app.hodora.mobile.routing.BikeProfile
import app.hodora.mobile.routing.LatLon
import io.github.jan.supabase.auth.auth

import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order

private val SUMMARY_COLUMNS =
    Columns.list("id", "name", "description", "distance_m", "ascent_m", "descent_m", "created_at")

private val RIDE_COLUMNS =
    Columns.list(
        "id",
        "name",
        "description",
        "source_filename",
        "distance_m",
        "ascent_m",
        "descent_m",
        "min_lat",
        "min_lon",
        "max_lat",
        "max_lon",
        "points",
        "cues",
        "notes",
        "created_at",
        "updated_at",
    )

class RidesRepository {
    private val postgrest = SupabaseModule.client.postgrest
    private val auth = SupabaseModule.client.auth

    // RLS (supabase/migrations/) scopes both queries below to the signed-in
    // rider's own rows automatically via the session's JWT — same as the
    // web client, no user_id filter needed on the read side.
    //
    // Phase 5: both reads fall back to the Room-backed OfflineStore on any
    // network failure — listRides() to whatever ride-list snapshot the last
    // successful fetch cached (every successful fetch refreshes it), getRide()
    // to a full ride only if it was explicitly saved for offline use (see
    // saveRideOffline below; not every viewed ride is cached automatically).
    // Both rethrow the original exception when there's nothing cached, so a
    // genuinely offline rider with nothing saved still sees a real error
    // instead of a silent empty list.
    suspend fun listRides(): List<RideSummary> =
        try {
            val rides =
                postgrest
                    .from("rides")
                    .select(columns = SUMMARY_COLUMNS) {
                        order("created_at", Order.DESCENDING)
                    }
                    .decodeList<RideSummary>()
            OfflineStore.putRideList(rides)
            rides
        } catch (e: Exception) {
            OfflineStore.getRideList() ?: throw e
        }

    // The `filter { eq(...) }` / trailing-lambda `select`+`insert` shapes
    // below match supabase-kt's postgrest-kt request-builder DSL as of the
    // version pinned in gradle/libs.versions.toml; if Gradle resolves a
    // newer major version with a different DSL, fix these call sites first
    // — RidesViewModel/RideDetailViewModel don't need to change either way.
    suspend fun getRide(id: String): Ride =
        try {
            postgrest
                .from("rides")
                .select(columns = RIDE_COLUMNS) {
                    filter { eq("id", id) }
                }
                .decodeSingle<Ride>()
        } catch (e: Exception) {
            OfflineStore.getOfflineRide(id) ?: throw e
        }

    /** Explicit "Save for offline" action (RideDetailScreen) — see OfflineStore's doc comment for why this isn't automatic. */
    suspend fun saveRideOffline(ride: Ride) = OfflineStore.putOfflineRide(ride)

    suspend fun isRideSavedOffline(id: String): Boolean = OfflineStore.isRideSavedOffline(id)

    suspend fun removeOfflineRide(id: String) = OfflineStore.deleteOfflineRide(id)

    /**
     * Saves a parsed route as a new ride. `sourceFilename` is set for a GPX
     * import; `cues`/`planWaypoints`/`planProfile` are set for a route saved
     * from the planner (Phase 2) — the two call sites use the same insert so
     * a ride's origin doesn't need two separate code paths downstream.
     */
    suspend fun createRide(
        parsed: ParsedRide,
        sourceFilename: String? = null,
        cues: List<RideCue> = emptyList(),
        planWaypoints: List<LatLon>? = null,
        planProfile: BikeProfile? = null,
        isRecorded: Boolean = false,
    ): String {
        val userId = auth.currentUserOrNull()?.id ?: error("Not signed in")
        val row =
            NewRide(
                userId = userId,
                name = parsed.name,
                sourceFilename = sourceFilename,
                distanceM = Math.round(parsed.distanceM).toInt(),
                ascentM = Math.round(parsed.ascentM).toInt(),
                descentM = Math.round(parsed.descentM).toInt(),
                minLat = parsed.bounds.minLat,
                minLon = parsed.bounds.minLon,
                maxLat = parsed.bounds.maxLat,
                maxLon = parsed.bounds.maxLon,
                points = parsed.points,
                cues = cues,
                planWaypoints = planWaypoints,
                planProfile = planProfile,
                isRecorded = isRecorded,
            )
        val inserted =
            postgrest
                .from("rides")
                .insert(row) { select(Columns.list("id")) }
                .decodeSingle<RideId>()
        return inserted.id
    }
}
