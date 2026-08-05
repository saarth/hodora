package com.hodora.app.data.repository

import com.hodora.app.data.db.RideDao
import com.hodora.app.data.db.RideEntity
import com.hodora.app.data.db.RideSummaryEntity
import com.hodora.app.data.model.ParsedRide
import com.hodora.app.data.model.Ride
import com.hodora.app.data.model.RideBounds
import com.hodora.app.data.model.RideSummary
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Local-only ride storage for Phase 1 (no auth/sync yet — mirrors the web
 * app's "guest mode", see src/lib/rides.ts). Room is the sole source of truth.
 */
@Singleton
class RideRepository @Inject constructor(private val dao: RideDao) {

    fun observeRides(): Flow<List<RideSummary>> =
        dao.observeSummaries().map { list -> list.map { it.toDomain() } }

    fun observeRide(id: String): Flow<Ride?> =
        dao.observeById(id).map { it?.toDomain() }

    suspend fun getRide(id: String): Ride? = dao.getById(id)?.toDomain()

    suspend fun saveParsedRide(parsed: ParsedRide, sourceFilename: String?): String {
        val id = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()
        dao.upsert(
            RideEntity(
                id = id,
                name = parsed.name,
                description = null,
                sourceFilename = sourceFilename,
                distanceM = parsed.distanceM,
                ascentM = parsed.ascentM,
                descentM = parsed.descentM,
                minLat = parsed.bounds.minLat,
                minLon = parsed.bounds.minLon,
                maxLat = parsed.bounds.maxLat,
                maxLon = parsed.bounds.maxLon,
                points = parsed.points,
                createdAt = now,
                updatedAt = now,
            ),
        )
        return id
    }

    suspend fun deleteRide(id: String) = dao.delete(id)

    suspend fun renameRide(id: String, name: String) =
        dao.rename(id, name, System.currentTimeMillis())
}

private fun RideEntity.toDomain(): Ride = Ride(
    id = id,
    name = name,
    description = description,
    sourceFilename = sourceFilename,
    distanceM = distanceM,
    ascentM = ascentM,
    descentM = descentM,
    bounds = boundsOrNull(minLat, minLon, maxLat, maxLon),
    points = points,
    createdAt = createdAt,
    updatedAt = updatedAt,
)

private fun RideSummaryEntity.toDomain(): RideSummary = RideSummary(
    id = id,
    name = name,
    description = description,
    sourceFilename = sourceFilename,
    distanceM = distanceM,
    ascentM = ascentM,
    descentM = descentM,
    bounds = boundsOrNull(minLat, minLon, maxLat, maxLon),
    createdAt = createdAt,
    updatedAt = updatedAt,
)

private fun boundsOrNull(minLat: Double?, minLon: Double?, maxLat: Double?, maxLon: Double?): RideBounds? =
    if (minLat != null && minLon != null && maxLat != null && maxLon != null) {
        RideBounds(minLat, minLon, maxLat, maxLon)
    } else {
        null
    }
