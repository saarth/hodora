package app.hodora.mobile.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.hodora.mobile.ui.navigation.HodoraNavHost

@Composable
fun HodoraApp(sharedRideId: String? = null) {
    Surface(modifier = Modifier.fillMaxSize()) {
        HodoraNavHost(sharedRideId = sharedRideId)
    }
}
