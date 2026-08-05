package com.hodora.app.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface RideDao {
    @Query(
        "SELECT id, name, description, sourceFilename, distanceM, ascentM, descentM, " +
            "minLat, minLon, maxLat, maxLon, createdAt, updatedAt FROM rides ORDER BY createdAt DESC",
    )
    fun observeSummaries(): Flow<List<RideSummaryEntity>>

    @Query("SELECT * FROM rides WHERE id = :id")
    fun observeById(id: String): Flow<RideEntity?>

    @Query("SELECT * FROM rides WHERE id = :id")
    suspend fun getById(id: String): RideEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(ride: RideEntity)

    @Query("DELETE FROM rides WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE rides SET name = :name, updatedAt = :updatedAt WHERE id = :id")
    suspend fun rename(id: String, name: String, updatedAt: Long)
}
