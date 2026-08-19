package app.hodora.mobile.cues

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Partial port of src/lib/cues.ts — just the piece routing.ts needs
 * (turning an OSRM maneuver into a stored cue). `cueText`/`buildCueSheet`
 * (geometry-detected turns, human-readable instruction text) belong with
 * Phase 3's turn-by-turn navigation, which is what actually renders a cue
 * sheet; nothing in Phase 1-2 displays one yet.
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
