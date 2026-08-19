package app.hodora.mobile.nav

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Port of src/lib/voice.ts, wired to Android's native TextToSpeech instead
 * of the Web Speech API. This is the actual point of porting it: native TTS
 * keeps speaking with the screen off and the app backgrounded, which the
 * web version — built on an API that mobile browsers suspend along with
 * everything else once the tab is hidden — never could.
 */
class VoiceAnnouncer(context: Context) {
    private var tts: TextToSpeech? = null
    private var ready = false

    init {
        tts =
            TextToSpeech(context.applicationContext) { status ->
                ready = status == TextToSpeech.SUCCESS
                if (ready) tts?.language = Locale.getDefault()
            }
    }

    /** Speaks [text] immediately, replacing anything still queued — a stale announcement finishing late is worse than skipping it. */
    fun speak(text: String) {
        if (!ready) return
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "hodora-nav-cue")
    }

    fun shutdown() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready = false
    }

    companion object {
        /** Distance thresholds (meters) an announcement fires at, checked nearest-first. */
        val THRESHOLDS_M = listOf(300, 100, 30)

        /**
         * Picks the next threshold to announce for the turn at [turnIndex], or
         * null if none has newly been crossed. `announced` keys are
         * "turnIndex:thresholdM" so a fresh turn (a new index) always gets its
         * own announcements even if an earlier turn used the same values.
         */
        fun nextAnnouncement(
            turnIndex: Int,
            turnDistanceM: Double,
            announced: Set<String>,
        ): Pair<String, Int>? {
            for (thresholdM in THRESHOLDS_M) {
                val key = "$turnIndex:$thresholdM"
                if (turnDistanceM <= thresholdM && key !in announced) {
                    return key to thresholdM
                }
            }
            return null
        }

        /** Spoken-friendly distance phrase for an announcement threshold, e.g. "300 meters" / "1,000 feet". */
        fun speakableDistance(
            thresholdM: Int,
            metric: Boolean,
        ): String {
            if (metric) return "$thresholdM meters"
            val feet = ((thresholdM * 3.28084) / 10).roundToInt() * 10
            return "$feet feet"
        }
    }
}

private const val PREFS_NAME = "hodora_nav"
private const val KEY_VOICE_ENABLED = "voice_enabled"

/** Off by default, same as the web app — a rider opts in via the mute/unmute control on the nav screen. */
fun getVoicePreference(context: Context): Boolean =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(KEY_VOICE_ENABLED, false)

fun setVoicePreference(
    context: Context,
    enabled: Boolean,
) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().putBoolean(KEY_VOICE_ENABLED, enabled).apply()
}
