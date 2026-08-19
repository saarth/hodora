package app.hodora.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import app.hodora.mobile.ui.HodoraApp
import app.hodora.mobile.ui.theme.HodoraTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HodoraTheme {
                HodoraApp(sharedRideId = sharedRideIdFromIntent())
            }
        }
    }

    /**
     * Extracts the token from a https://hodora.app/share/{token} App Link
     * (see the intent-filter on this activity in AndroidManifest.xml) —
     * null for a normal launcher/notification launch, which is the common
     * case. Doesn't handle a share link arriving via onNewIntent while the
     * app is already running (singleTask launch mode means that's possible)
     * — a follow-up if that turns out to matter in practice.
     */
    private fun sharedRideIdFromIntent(): String? {
        val data = intent?.data ?: return null
        if (data.host != "hodora.app") return null
        val segments = data.pathSegments
        if (segments.size < 2 || segments[0] != "share") return null
        return segments[1]
    }
}
