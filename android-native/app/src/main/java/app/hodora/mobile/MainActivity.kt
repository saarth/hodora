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
                HodoraApp()
            }
        }
    }
}
