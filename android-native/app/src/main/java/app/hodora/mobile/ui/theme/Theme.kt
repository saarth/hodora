package app.hodora.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors =
    lightColorScheme(
        primary = RacingGreen,
        onPrimary = Cream,
        secondary = RacingGreenDark,
    )

private val DarkColors =
    darkColorScheme(
        primary = Cream,
        onPrimary = RacingGreenDark,
        secondary = RacingGreen,
    )

@Composable
fun HodoraTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
