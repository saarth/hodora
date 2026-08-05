package com.hodora.app.data.model

import kotlinx.serialization.Serializable

/**
 * A single point along a route. Mirrors `RidePoint` in src/lib/gpx.ts:
 * `ele` rounded to 1 decimal, `d` (cumulative distance in meters from the
 * route start) rounded to the nearest integer, `gap` set only when a real
 * GPX `<trkseg>` break happens here (never bridge it with a straight line).
 */
@Serializable
data class RidePoint(
    val lat: Double,
    val lon: Double,
    val ele: Double,
    val d: Double,
    val gap: Boolean = false,
)

@Serializable
data class RideBounds(
    val minLat: Double,
    val minLon: Double,
    val maxLat: Double,
    val maxLon: Double,
)

/** Splits a flat point list into contiguous runs, breaking at `gap` points — port of splitBySegments. */
fun List<RidePoint>.splitBySegments(): List<List<RidePoint>> {
    val segments = mutableListOf<MutableList<RidePoint>>()
    var current = mutableListOf<RidePoint>()
    for (p in this) {
        if (p.gap && current.isNotEmpty()) {
            segments += current
            current = mutableListOf()
        }
        current += p
    }
    if (current.isNotEmpty()) segments += current
    return segments
}
