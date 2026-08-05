package com.hodora.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    background = HodoraColors.Light.background,
    onBackground = HodoraColors.Light.foreground,
    surface = HodoraColors.Light.card,
    onSurface = HodoraColors.Light.foreground,
    surfaceVariant = HodoraColors.Light.elevated,
    onSurfaceVariant = HodoraColors.Light.mutedForeground,
    primary = HodoraColors.Light.primary,
    onPrimary = HodoraColors.Light.primaryForeground,
    secondary = HodoraColors.Light.secondary,
    onSecondary = HodoraColors.Light.foreground,
    tertiary = HodoraColors.Light.accent,
    onTertiary = HodoraColors.Light.accentForeground,
    error = HodoraColors.Light.destructive,
    onError = HodoraColors.Light.card,
    outline = HodoraColors.Light.border,
    outlineVariant = HodoraColors.Light.input,
)

private val DarkColors = darkColorScheme(
    background = HodoraColors.Dark.background,
    onBackground = HodoraColors.Dark.foreground,
    surface = HodoraColors.Dark.card,
    onSurface = HodoraColors.Dark.foreground,
    surfaceVariant = HodoraColors.Dark.elevated,
    onSurfaceVariant = HodoraColors.Dark.mutedForeground,
    primary = HodoraColors.Dark.primary,
    onPrimary = HodoraColors.Dark.primaryForeground,
    secondary = HodoraColors.Dark.secondary,
    onSecondary = HodoraColors.Dark.foreground,
    tertiary = HodoraColors.Dark.accent,
    onTertiary = HodoraColors.Dark.accentForeground,
    error = HodoraColors.Dark.destructive,
    onError = HodoraColors.Dark.card,
    outline = HodoraColors.Dark.border,
    outlineVariant = HodoraColors.Dark.input,
)

/** Extra tokens that don't have a Material3 ColorScheme slot (route line, warning, chart series). */
data class HodoraExtraColors(
    val route: androidx.compose.ui.graphics.Color,
    val warning: androidx.compose.ui.graphics.Color,
    val chart1: androidx.compose.ui.graphics.Color,
    val chart2: androidx.compose.ui.graphics.Color,
    val chart3: androidx.compose.ui.graphics.Color,
    val chart4: androidx.compose.ui.graphics.Color,
    val chart5: androidx.compose.ui.graphics.Color,
)

val LocalHodoraExtraColors = androidx.compose.runtime.staticCompositionLocalOf {
    HodoraExtraColors(
        route = HodoraColors.Light.route,
        warning = HodoraColors.Light.warning,
        chart1 = HodoraColors.Light.chart1,
        chart2 = HodoraColors.Light.chart2,
        chart3 = HodoraColors.Light.chart3,
        chart4 = HodoraColors.Light.chart4,
        chart5 = HodoraColors.Light.chart5,
    )
}

object HodoraTheme {
    val extraColors: HodoraExtraColors
        @Composable get() = LocalHodoraExtraColors.current
}

@Composable
fun HodoraTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    val extras = if (darkTheme) {
        HodoraExtraColors(
            route = HodoraColors.Dark.route,
            warning = HodoraColors.Dark.warning,
            chart1 = HodoraColors.Dark.chart1,
            chart2 = HodoraColors.Dark.chart2,
            chart3 = HodoraColors.Dark.chart3,
            chart4 = HodoraColors.Dark.chart4,
            chart5 = HodoraColors.Dark.chart5,
        )
    } else {
        HodoraExtraColors(
            route = HodoraColors.Light.route,
            warning = HodoraColors.Light.warning,
            chart1 = HodoraColors.Light.chart1,
            chart2 = HodoraColors.Light.chart2,
            chart3 = HodoraColors.Light.chart3,
            chart4 = HodoraColors.Light.chart4,
            chart5 = HodoraColors.Light.chart5,
        )
    }

    androidx.compose.runtime.CompositionLocalProvider(LocalHodoraExtraColors provides extras) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = HodoraTypography,
            content = content,
        )
    }
}
