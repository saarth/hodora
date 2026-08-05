package com.hodora.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.hodora.app.R

/** --font-display / --font-sans in styles.css: variable-font weight axis via FontVariation. */
private fun jakartaWeight(weight: Int) = Font(
    resId = R.font.plus_jakarta_sans,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

val DisplayFontFamily = FontFamily(
    jakartaWeight(400),
    jakartaWeight(500),
    jakartaWeight(600),
    jakartaWeight(700),
    jakartaWeight(800),
    Font(
        resId = R.font.plus_jakarta_sans_italic,
        weight = FontWeight(400),
        style = androidx.compose.ui.text.font.FontStyle.Italic,
        variationSettings = FontVariation.Settings(FontVariation.weight(400)),
    ),
)

/** --font-mono in styles.css, used for stat figures (tabular numerals). */
val MonoFontFamily = FontFamily(
    Font(
        resId = R.font.jetbrains_mono,
        weight = FontWeight(500),
        variationSettings = FontVariation.Settings(FontVariation.weight(500)),
    ),
    Font(
        resId = R.font.jetbrains_mono,
        weight = FontWeight(700),
        variationSettings = FontVariation.Settings(FontVariation.weight(700)),
    ),
)

val HodoraTypography = Typography(
    displayLarge = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(700), fontSize = 36.sp, letterSpacing = (-0.02).sp),
    headlineLarge = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(700), fontSize = 28.sp, letterSpacing = (-0.02).sp),
    headlineMedium = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(700), fontSize = 24.sp, letterSpacing = (-0.02).sp),
    headlineSmall = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(600), fontSize = 20.sp, letterSpacing = (-0.02).sp),
    titleLarge = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(600), fontSize = 18.sp),
    titleMedium = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(600), fontSize = 16.sp),
    bodyLarge = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(400), fontSize = 16.sp),
    bodyMedium = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(400), fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(400), fontSize = 12.sp),
    labelLarge = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(600), fontSize = 14.sp),
    labelMedium = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(500), fontSize = 12.sp),
    labelSmall = TextStyle(fontFamily = DisplayFontFamily, fontWeight = FontWeight(500), fontSize = 11.sp),
)

/** Numeric stats (distance/elevation/time figures) — mirrors the .stat-figure utility class. */
val StatFigureStyle = TextStyle(
    fontFamily = DisplayFontFamily,
    fontWeight = FontWeight(700),
    letterSpacing = (-0.03).sp,
    fontFeatureSettings = "tnum", // font-variant-numeric: tabular-nums
)
