package com.hodora.app.ui.navigation

import com.hodora.app.data.model.RidePoint
import com.hodora.app.data.model.Snap
import com.hodora.app.data.model.Turn

/** Live navigation state published by [NavigationService], observed by [NavViewModel]. */
data class NavServiceState(
    val rideId: String,
    val points: List<RidePoint>,
    val snap: Snap,
    val turns: List<Turn>,
    val nextTurn: Turn?,
    val offRoute: Boolean,
    val finished: Boolean,
    val remainingAscentM: Double,
    val gradePercent: Double,
    val speedMps: Double,
    val headingDeg: Double,
    val distanceM: Double,
)
