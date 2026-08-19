package app.hodora.mobile.cues

import app.hodora.mobile.gpx.RidePoint
import app.hodora.mobile.nav.TurnDirection
import app.hodora.mobile.nav.detectTurns
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Full port of src/lib/cues.ts. A cue sheet is built either from real
 * router step data (fetchOsrmRoute in routing/Routing.kt, stored on the
 * ride) or, when none was captured — an imported GPX, or a route drawn
 * from BRouter geometry alone — derived on the fly from detectTurns so
 * NavigationService always has something to announce, just without street
 * names.
 */
@Serializable
enum class CueDirection {
    @SerialName("depart") DEPART,
    @SerialName("arrive") ARRIVE,
    @SerialName("left") LEFT,
    @SerialName("right") RIGHT,
    @SerialName("sharp-left") SHARP_LEFT,
    @SerialName("sharp-right") SHARP_RIGHT,
    @SerialName("slight-left") SLIGHT_LEFT,
    @SerialName("slight-right") SLIGHT_RIGHT,
    @SerialName("straight") STRAIGHT,
    @SerialName("uturn") UTURN,
    @SerialName("roundabout") ROUNDABOUT,
    @SerialName("merge") MERGE,
    @SerialName("fork") FORK,
    @SerialName("other") OTHER,
}

/** One instruction a router produced, as stored on a ride's `cues` column. */
@Serializable
data class RideCue(
    val atM: Double,
    val direction: CueDirection,
    val name: String? = null,
)

/** Maps an OSRM maneuver.type/maneuver.modifier pair to our direction enum. */
fun osrmDirection(
    type: String,
    modifier: String?,
): CueDirection {
    if (type == "depart") return CueDirection.DEPART
    if (type == "arrive") return CueDirection.ARRIVE
    if (type in ROUNDABOUT_TYPES) return CueDirection.ROUNDABOUT
    if (type == "merge") return CueDirection.MERGE
    if (type == "fork") return CueDirection.FORK
    return when (modifier) {
        "left" -> CueDirection.LEFT
        "right" -> CueDirection.RIGHT
        "sharp left" -> CueDirection.SHARP_LEFT
        "sharp right" -> CueDirection.SHARP_RIGHT
        "slight left" -> CueDirection.SLIGHT_LEFT
        "slight right" -> CueDirection.SLIGHT_RIGHT
        "straight" -> CueDirection.STRAIGHT
        "uturn" -> CueDirection.UTURN
        else -> CueDirection.OTHER
    }
}

private val ROUNDABOUT_TYPES =
    setOf("roundabout", "rotary", "roundabout turn", "exit roundabout", "exit rotary")

/** Human-readable instruction text for a direction + optional street name. */
fun cueText(
    direction: CueDirection,
    name: String?,
): String {
    val trimmedName = name?.trim()?.takeIf { it.isNotEmpty() }
    val onto = trimmedName?.let { " onto $it" }.orEmpty()
    return when (direction) {
        CueDirection.DEPART -> trimmedName?.let { "Head out on $it" } ?: "Start"
        CueDirection.ARRIVE -> "Arrive at destination"
        CueDirection.ROUNDABOUT -> "Take the roundabout$onto"
        CueDirection.MERGE -> "Merge$onto"
        CueDirection.FORK -> "Keep at the fork$onto"
        CueDirection.STRAIGHT -> "Continue straight$onto"
        CueDirection.UTURN -> "Make a U-turn$onto"
        CueDirection.LEFT -> "Turn left$onto"
        CueDirection.RIGHT -> "Turn right$onto"
        CueDirection.SHARP_LEFT -> "Sharp left$onto"
        CueDirection.SHARP_RIGHT -> "Sharp right$onto"
        CueDirection.SLIGHT_LEFT -> "Slight left$onto"
        CueDirection.SLIGHT_RIGHT -> "Slight right$onto"
        CueDirection.OTHER -> if (trimmedName != null) "Continue$onto" else "Continue"
    }
}

/** A cue with the distance from the previous entry filled in — what the nav UI renders. */
data class CueSheetEntry(
    val atM: Double,
    val direction: CueDirection,
    val name: String?,
    /** distance in meters from the previous entry to this one */
    val legM: Double,
    val text: String,
)

private val TURN_DIRECTION_TO_CUE =
    mapOf(
        TurnDirection.LEFT to CueDirection.LEFT,
        TurnDirection.RIGHT to CueDirection.RIGHT,
        TurnDirection.SHARP_LEFT to CueDirection.SHARP_LEFT,
        TurnDirection.SHARP_RIGHT to CueDirection.SHARP_RIGHT,
    )

/** Fallback cue source when no router provided step data: geometry-only turns, no street names. */
private fun cuesFromDetectedTurns(points: List<RidePoint>): List<RideCue> =
    detectTurns(points).map { turn ->
        RideCue(atM = turn.at.toDouble(), direction = TURN_DIRECTION_TO_CUE[turn.direction] ?: CueDirection.OTHER, name = null)
    }

/**
 * Builds the full, orderable instruction list for a route: a synthetic
 * "Start" entry, every real or detected turn strictly between the
 * endpoints, and a synthetic "Arrive" entry — each with the distance from
 * the previous entry (legM) and display text filled in.
 */
fun buildCueSheet(
    points: List<RidePoint>,
    storedCues: List<RideCue> = emptyList(),
): List<CueSheetEntry> {
    if (points.size < 2) return emptyList()
    val totalM = points.last().d.toDouble()
    val middle =
        (storedCues.ifEmpty { cuesFromDetectedTurns(points) })
            .filter { it.atM > 5 && it.atM < totalM - 5 }
            .sortedBy { it.atM }

    val all =
        buildList {
            add(RideCue(atM = 0.0, direction = CueDirection.DEPART, name = null))
            addAll(middle)
            add(RideCue(atM = totalM, direction = CueDirection.ARRIVE, name = null))
        }

    return all.mapIndexed { i, cue ->
        val legM = if (i == 0) 0.0 else (cue.atM - all[i - 1].atM).coerceAtLeast(0.0)
        val text = if (i == 0 && cue.direction == CueDirection.DEPART) "Start" else cueText(cue.direction, cue.name)
        CueSheetEntry(atM = cue.atM, direction = cue.direction, name = cue.name, legM = legM, text = text)
    }
}

/** Whether a ride has real router-provided cues (street names) rather than only geometry-detected turns. */
fun hasRouterCues(cues: List<RideCue>?): Boolean = !cues.isNullOrEmpty()

/**
 * The name of the cue sheet entry closest to atM, within toleranceM — used
 * to enrich a live turn-by-turn detection (which only knows geometry, not
 * street names) with a name from the router-provided cue sheet when one is
 * close enough to plausibly be the same turn. Returns null both when
 * nothing is close enough and when the closest entry has no name.
 */
fun nearestCueName(
    entries: List<CueSheetEntry>,
    atM: Double,
    toleranceM: Double = 25.0,
): String? {
    var best: CueSheetEntry? = null
    var bestDist = Double.POSITIVE_INFINITY
    for (entry in entries) {
        val dist = kotlin.math.abs(entry.atM - atM)
        if (dist < bestDist) {
            bestDist = dist
            best = entry
        }
    }
    return if (best != null && bestDist <= toleranceM) best.name else null
}
