package com.hodora.app.data.gpx

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** Port of the math helpers in src/lib/gpx.ts. */
object GeoMath {
    /** Mean Earth radius in meters — same constant used by the web app's haversine(). */
    const val EARTH_RADIUS_M = 6371008.8

    fun haversine(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val dLat = Math.toRadians(bLat - aLat)
        val dLon = Math.toRadians(bLon - aLon)
        val lat1 = Math.toRadians(aLat)
        val lat2 = Math.toRadians(bLat)
        val h = sin(dLat / 2) * sin(dLat / 2) +
            cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * EARTH_RADIUS_M * atan2(sqrt(h), sqrt(1 - h))
    }

    /** Initial bearing in degrees, 0..360. */
    fun bearing(aLat: Double, aLon: Double, bLat: Double, bLon: Double): Double {
        val lat1 = Math.toRadians(aLat)
        val lat2 = Math.toRadians(bLat)
        val dLon = Math.toRadians(bLon - aLon)
        val y = sin(dLon) * cos(lat2)
        val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        val deg = Math.toDegrees(atan2(y, x))
        return (deg + 360) % 360
    }

    /** Signed smallest angle from `from` to `to` bearing; positive = right turn. */
    fun bearingDelta(from: Double, to: Double): Double {
        val delta = ((to - from + 540) % 360) - 180
        return if (delta == -180.0) 180.0 else delta
    }

    fun degToRad(deg: Double): Double = deg * PI / 180
}
