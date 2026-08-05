package com.hodora.app.data.model

/** In-memory result of parsing a GPX file — port of `ParsedRide` in src/lib/gpx.ts. */
data class ParsedRide(
    val name: String,
    val points: List<RidePoint>,
    val distanceM: Double,
    val ascentM: Double,
    val descentM: Double,
    val bounds: RideBounds,
)

/**
 * A saved ride. Mirrors the web app's `Ride` type (src/lib/rides.ts) minus
 * `user_id`/auth fields, since Phase 1 is local-only (no Supabase sync yet).
 */
data class Ride(
    val id: String,
    val name: String,
    val description: String?,
    val sourceFilename: String?,
    val distanceM: Double,
    val ascentM: Double,
    val descentM: Double,
    val bounds: RideBounds?,
    val points: List<RidePoint>,
    val createdAt: Long,
    val updatedAt: Long,
)

/** Ride without `points` — for list screens that don't need the full track. */
data class RideSummary(
    val id: String,
    val name: String,
    val description: String?,
    val sourceFilename: String?,
    val distanceM: Double,
    val ascentM: Double,
    val descentM: Double,
    val bounds: RideBounds?,
    val createdAt: Long,
    val updatedAt: Long,
)

enum class MeasurementUnit { METRIC, IMPERIAL }
