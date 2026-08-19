package app.hodora.mobile.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface OfflineDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putRide(entity: OfflineRideEntity)

    @Query("SELECT * FROM offline_rides WHERE id = :id")
    suspend fun getRide(id: String): OfflineRideEntity?

    @Query("DELETE FROM offline_rides WHERE id = :id")
    suspend fun deleteRide(id: String)

    @Query("SELECT id FROM offline_rides")
    suspend fun listRideIds(): List<String>

    @Query("SELECT * FROM offline_rides ORDER BY savedAt DESC")
    suspend fun listRides(): List<OfflineRideEntity>

    @Query("DELETE FROM offline_rides")
    suspend fun clearRides()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun putMeta(entity: MetaEntity)

    @Query("SELECT * FROM meta WHERE `key` = :key")
    suspend fun getMeta(key: String): MetaEntity?

    @Query("DELETE FROM meta")
    suspend fun clearMeta()
}
