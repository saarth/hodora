@file:OptIn(ExperimentalTextApi::class)

package app.hodora.mobile.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.hodora.mobile.R

// Hodora's type system (src/routes/__root.tsx's Google Fonts link,
// src/styles.css's --font-sans/--font-serif/--font-mono): Space Grotesk for
// structure/UI, Fraunces italic as a voice/accent face, IBM Plex Mono for
// spec/stat figures. Space Grotesk and Fraunces ship as variable fonts, so
// one file covers every weight via FontVariation.Settings.

private fun spaceGroteskWeight(weight: Int) =
    Font(
        R.font.space_grotesk,
        weight = FontWeight(weight),
        variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
    )

val SpaceGrotesk =
    FontFamily(
        spaceGroteskWeight(400),
        spaceGroteskWeight(500),
        spaceGroteskWeight(600),
        spaceGroteskWeight(700),
    )

val FrauncesItalic =
    FontFamily(
        Font(
            R.font.fraunces_italic,
            weight = FontWeight(400),
            style = FontStyle.Italic,
            variationSettings = FontVariation.Settings(FontVariation.weight(400)),
        ),
        Font(
            R.font.fraunces_italic,
            weight = FontWeight(500),
            style = FontStyle.Italic,
            variationSettings = FontVariation.Settings(FontVariation.weight(500)),
        ),
    )

val IbmPlexMono =
    FontFamily(
        Font(R.font.ibm_plex_mono_regular, weight = FontWeight.Normal),
        Font(R.font.ibm_plex_mono_medium, weight = FontWeight.Medium),
        Font(R.font.ibm_plex_mono_bold, weight = FontWeight.Bold),
    )

// A mono TextStyle for stat figures (distance, speed, elapsed time, etc.) —
// tabular numerals so digits don't shift width as they change, matching the
// web app's .stat-figure utility.
val StatFigureStyle =
    TextStyle(
        fontFamily = IbmPlexMono,
        fontFeatureSettings = "tnum",
    )

// An uppercase, letter-spaced label style for stat captions — matches the
// web app's .caption utility (e.g. "DISTANCE", "ELAPSED").
val CaptionStyle =
    TextStyle(
        fontFamily = SpaceGrotesk,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.9.sp,
    )

private val baseline = Typography()

val HodoraTypography =
    Typography(
        displayLarge = baseline.displayLarge.copy(fontFamily = SpaceGrotesk),
        displayMedium = baseline.displayMedium.copy(fontFamily = SpaceGrotesk),
        displaySmall = baseline.displaySmall.copy(fontFamily = SpaceGrotesk),
        headlineLarge = baseline.headlineLarge.copy(fontFamily = SpaceGrotesk, fontWeight = FontWeight.Bold),
        headlineMedium = baseline.headlineMedium.copy(fontFamily = SpaceGrotesk, fontWeight = FontWeight.Bold),
        headlineSmall = baseline.headlineSmall.copy(fontFamily = SpaceGrotesk, fontWeight = FontWeight.Bold),
        titleLarge = baseline.titleLarge.copy(fontFamily = SpaceGrotesk, fontWeight = FontWeight.Bold),
        titleMedium = baseline.titleMedium.copy(fontFamily = SpaceGrotesk, fontWeight = FontWeight.SemiBold),
        titleSmall = baseline.titleSmall.copy(fontFamily = SpaceGrotesk, fontWeight = FontWeight.SemiBold),
        bodyLarge = baseline.bodyLarge.copy(fontFamily = SpaceGrotesk),
        bodyMedium = baseline.bodyMedium.copy(fontFamily = SpaceGrotesk),
        bodySmall = baseline.bodySmall.copy(fontFamily = SpaceGrotesk),
        labelLarge = baseline.labelLarge.copy(fontFamily = SpaceGrotesk, fontWeight = FontWeight.SemiBold),
        labelMedium = baseline.labelMedium.copy(fontFamily = SpaceGrotesk, fontWeight = FontWeight.SemiBold),
        labelSmall = baseline.labelSmall.copy(fontFamily = SpaceGrotesk, fontWeight = FontWeight.SemiBold),
    )
