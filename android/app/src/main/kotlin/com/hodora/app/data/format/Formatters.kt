package com.hodora.app.data.format

import java.util.Locale
import kotlin.math.roundToInt

/** Port of formatDistance/formatElevation/formatDuration/formatSpeed in src/lib/gpx.ts. */
object Formatters {

    fun distance(meters: Double, metric: Boolean = true): String {
        if (!metric) {
            val miles = meters / 1609.344
            return if (miles < 0.2) {
                val feet = meters * 3.28084
                "${feet.roundToInt()} ft"
            } else {
                val decimals = if (miles < 10) 2 else 1
                "${format(miles, decimals)} mi"
            }
        }
        if (meters < 1000) return "${meters.roundToInt()} m"
        val km = meters / 1000
        val decimals = if (meters < 10_000) 2 else 1
        return "${format(km, decimals)} km"
    }

    fun elevation(meters: Double, metric: Boolean = true): String {
        return if (metric) {
            "${meters.roundToInt()} m"
        } else {
            "${(meters * 3.28084).roundToInt()} ft"
        }
    }

    fun duration(seconds: Double): String {
        if (!seconds.isFinite() || seconds <= 0) return "--"
        val totalMinutes = (seconds / 60).roundToInt()
        val hours = totalMinutes / 60
        val minutes = totalMinutes % 60
        return if (hours >= 1) {
            "${hours}h ${minutes.toString().padStart(2, '0')}m"
        } else {
            "$minutes min"
        }
    }

    fun speed(metersPerSecond: Double, metric: Boolean = true): String {
        if (!metersPerSecond.isFinite() || metersPerSecond <= 0) return "0.0"
        val value = if (metric) metersPerSecond * 3.6 else metersPerSecond * 2.236936
        return format(value, 1)
    }

    private fun format(value: Double, decimals: Int): String =
        String.format(Locale.US, "%.${decimals}f", value)
}
