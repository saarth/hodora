package com.hodora.app.data.model

/** Port of `TurnDirection`/`Turn` in src/lib/nav.ts. */
enum class TurnDirection { LEFT, SHARP_LEFT, RIGHT, SHARP_RIGHT }

data class Turn(
    val index: Int,
    val at: Double,
    val direction: TurnDirection,
    val angle: Double,
)

/** Port of `Snap` in src/lib/nav.ts — the live GPS fix projected onto the route. */
data class Snap(
    val index: Int,
    val offRouteM: Double,
    val progressM: Double,
    val lat: Double,
    val lon: Double,
)
