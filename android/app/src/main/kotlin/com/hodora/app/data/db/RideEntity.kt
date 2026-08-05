package com.hodora.app.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.hodora.app.data.model.RidePoint

@Entity(tableName = "rides")
data class RideEntity(
    @PrimaryKey val id: String,
    val name: String,
    val description: String?,
    val sourceFilename: String?,
    val distanceM: Double,
    val ascentM: Double,
    val descentM: Double,
    val minLat: Double?,
    val minLon: Double?,
    val maxLat: Double?,
    val maxLon: Double?,
    val points: List<RidePoint>,
    val createdAt: Long,
    val updatedAt: Long,
)

/** Projection used by the rides list screen — excludes `points` so the query stays cheap. */
data class RideSummaryEntity(
    val id: String,
    val name: String,
    val description: String?,
    val sourceFilename: String?,
    val distanceM: Double,
    val ascentM: Double,
    val descentM: Double,
    val minLat: Double?,
    val minLon: Double?,
    val maxLat: Double?,
    val maxLon: Double?,
    val createdAt: Long,
    val updatedAt: Long,
)
