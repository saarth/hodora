package app.hodora.mobile.data.local

import android.content.Context
import androidx.room.Room
import app.hodora.mobile.data.model.Ride
import app.hodora.mobile.data.model.RideSummary
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Kotlin/Room equivalent of src/lib/offline-db.ts's IndexedDB store — full
 * ride records plus a cached ride-list snapshot, so the rides list and
 * navigation both keep working with no network connection at all. A plain
 * object singleton (like SupabaseModule.client), initialized once from
 * HodoraApplication.onCreate rather than injected — matches this codebase's
 * existing style for shared, process-wide resources.
 */
object OfflineStore {
    private const val RIDE_LIST_KEY = "ride-list"
    private val json = Json { ignoreUnknownKeys = true }

    private lateinit var database: OfflineDatabase

    fun init(context: Context) {
        if (::database.isInitialized) return
        database =
            Room.databaseBuilder(context.applicationContext, OfflineDatabase::class.java, "hodora-offline.db")
                .build()
    }

    private val dao get() = database.dao()

    /**
     * Saves a ride for offline navigation — deliberately *not* automatic on
     * every ride view (same reasoning as putOfflineRide's doc comment in
     * offline-db.ts): this is only called from an explicit "Save for
     * offline" action, since caching every viewed ride would grow this
     * database for no reason the rider asked for.
     */
    suspend fun putOfflineRide(ride: Ride) {
        dao.putRide(OfflineRideEntity(id = ride.id, json = json.encodeToString(ride), savedAt = System.currentTimeMillis()))
    }

    suspend fun getOfflineRide(id: String): Ride? = dao.getRide(id)?.let { json.decodeFromString<Ride>(it.json) }

    suspend fun isRideSavedOffline(id: String): Boolean = dao.getRide(id) != null

    suspend fun deleteOfflineRide(id: String) = dao.deleteRide(id)

    suspend fun listOfflineRideIds(): List<String> = dao.listRideIds()

    suspend fun listOfflineRides(): List<Ride> = dao.listRides().map { json.decodeFromString<Ride>(it.json) }

    suspend fun putRideList(rides: List<RideSummary>) {
        dao.putMeta(MetaEntity(key = RIDE_LIST_KEY, json = json.encodeToString(rides)))
    }

    suspend fun getRideList(): List<RideSummary>? =
        dao.getMeta(RIDE_LIST_KEY)?.let { json.decodeFromString<List<RideSummary>>(it.json) }

    /** Wipes every locally cached ride and the ride-list snapshot — does not touch downloaded map tiles, see offline/OfflineMaps.kt's removeRouteRegion for that. */
    suspend fun clearOfflineData() {
        dao.clearRides()
        dao.clearMeta()
    }
}
