package app.hodora.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// Hodora's exact design tokens (src/styles.css), for the custom surfaces,
// stat figures and buttons that reproduce the design mockups pixel-for-pixel
// — richer than what fits in Material3's ColorScheme slots.
data class HodoraColors(
    val bg: Color,
    val ink: Color,
    val card: Color,
    val elevated: Color,
    val primary: Color,
    val primaryInk: Color,
    val mutedInk: Color,
    val accent: Color,
    val accentInk: Color,
    val brass: Color,
    val rust: Color,
    val destructive: Color,
    val destructiveInk: Color,
    val border: Color,
)

private val LightHodoraColors =
    HodoraColors(
        bg = LightBg,
        ink = LightInk,
        card = LightCard,
        elevated = LightElevated,
        primary = LightPrimary,
        primaryInk = LightPrimaryInk,
        mutedInk = LightMutedInk,
        accent = LightAccent,
        accentInk = LightAccentInk,
        brass = Brass,
        rust = Rust,
        destructive = LightDestructive,
        destructiveInk = LightDestructiveInk,
        border = LightBorder,
    )

private val DarkHodoraColors =
    HodoraColors(
        bg = DarkBg,
        ink = DarkInk,
        card = DarkCard,
        elevated = DarkElevated,
        primary = DarkPrimary,
        primaryInk = DarkPrimaryInk,
        mutedInk = DarkMutedInk,
        accent = DarkAccent,
        accentInk = DarkAccentInk,
        brass = Brass,
        rust = Rust,
        destructive = DarkDestructive,
        destructiveInk = DarkDestructiveInk,
        border = DarkBorder,
    )

val LocalHodoraColors = staticCompositionLocalOf { LightHodoraColors }

private val LightColors: ColorScheme =
    lightColorScheme(
        background = LightBg,
        onBackground = LightInk,
        surface = LightCard,
        onSurface = LightInk,
        surfaceVariant = LightElevated,
        onSurfaceVariant = LightMutedInk,
        primary = LightPrimary,
        onPrimary = LightPrimaryInk,
        primaryContainer = LightElevated,
        onPrimaryContainer = LightInk,
        secondaryContainer = LightElevated,
        onSecondaryContainer = LightInk,
        tertiary = Rust,
        onTertiary = LightPrimaryInk,
        tertiaryContainer = LightAccent,
        onTertiaryContainer = LightAccentInk,
        error = LightDestructive,
        onError = LightDestructiveInk,
        outline = LightMutedInk,
        outlineVariant = LightBorder,
    )

private val DarkColors: ColorScheme =
    darkColorScheme(
        background = DarkBg,
        onBackground = DarkInk,
        surface = DarkCard,
        onSurface = DarkInk,
        surfaceVariant = DarkElevated,
        onSurfaceVariant = DarkMutedInk,
        primary = DarkPrimary,
        onPrimary = DarkPrimaryInk,
        primaryContainer = DarkElevated,
        onPrimaryContainer = DarkInk,
        secondaryContainer = DarkElevated,
        onSecondaryContainer = DarkInk,
        tertiary = Rust,
        onTertiary = DarkPrimaryInk,
        tertiaryContainer = DarkAccent,
        onTertiaryContainer = DarkAccentInk,
        error = DarkDestructive,
        onError = DarkDestructiveInk,
        outline = DarkMutedInk,
        outlineVariant = DarkBorder,
    )

@Composable
fun HodoraTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val hodoraColors = if (darkTheme) DarkHodoraColors else LightHodoraColors
    CompositionLocalProvider(LocalHodoraColors provides hodoraColors) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColors else LightColors,
            typography = HodoraTypography,
            content = content,
        )
    }
}
