package app.hodora.mobile.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * A full ride, cached for offline navigation — stored as its already-
 * serialized JSON (kotlinx.serialization, same @Serializable Ride the
 * network path decodes) rather than mapped column-by-column. Ride's shape
 * (nested points/cues/notes lists) doesn't map cleanly onto Room's flat
 * relational model, and a JSON blob keyed by id is the direct Room
 * equivalent of offline-db.ts's IndexedDB object store, which does the
 * same thing (`store.put({...ride, savedAt})`).
 */
@Entity(tableName = "offline_rides")
data class OfflineRideEntity(
    @PrimaryKey val id: String,
    val json: String,
    val savedAt: Long,
)

/** Small key-value table for the cached ride-list snapshot (offline-db.ts's `META` store). */
@Entity(tableName = "meta")
data class MetaEntity(
    @PrimaryKey val key: String,
    val json: String,
)
