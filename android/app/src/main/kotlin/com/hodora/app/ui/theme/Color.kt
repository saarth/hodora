package com.hodora.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Ported from src/styles.css. Every value below is the sRGB conversion of the
 * original oklch() token (same L/C/H inputs), so hues/lightness match the web
 * app pixel-for-pixel rather than being eyeballed equivalents.
 */
object HodoraColors {
    object Light {
        val background = Color(0xFFFAFAF8)
        val foreground = Color(0xFF0B1421)
        val card = Color(0xFFFFFFFF)
        val elevated = Color(0xFFF1F5F0)
        val primary = Color(0xFF92CE14)
        val primaryForeground = Color(0xFF031A00)
        val secondary = Color(0xFFEBF1F7)
        val muted = Color(0xFFECF1F5)
        val mutedForeground = Color(0xFF616A75)
        val accent = Color(0xFFD7F2CA)
        val accentForeground = Color(0xFF11250D)
        val destructive = Color(0xFFDB2A36)
        val warning = Color(0xFFF5A420)
        val border = Color(0xFFD9DFE5)
        val input = Color(0xFFD9DFE5)
        val ring = Color(0xFF92CE14)
        val route = Color(0xFF11A22F)
        val chart1 = Color(0xFF7CBA10)
        val chart2 = Color(0xFF00959C)
        val chart3 = Color(0xFFE49E22)
        val chart4 = Color(0xFF47619C)
        val chart5 = Color(0xFFF04C5A)
    }

    object Dark {
        val background = Color(0xFF0A1120)
        val foreground = Color(0xFFEDF3F7)
        val card = Color(0xFF151E2E)
        val elevated = Color(0xFF1D2638)
        val primary = Color(0xFFA9E932)
        val primaryForeground = Color(0xFF051C01)
        val secondary = Color(0xFF20293A)
        val muted = Color(0xFF212938)
        val mutedForeground = Color(0xFF98A3AF)
        val accent = Color(0xFF1C3B24)
        val accentForeground = Color(0xFFCAF68E)
        val destructive = Color(0xFFF45058)
        val warning = Color(0xFFFFB232)
        val border = Color(0x1FF3FAFF)
        val input = Color(0x29F3FAFF)
        val ring = Color(0xFFA9E932)
        val route = Color(0xFFA9E932)
        val chart1 = Color(0xFFA9E932)
        val chart2 = Color(0xFF17BAC8)
        val chart3 = Color(0xFFF9B73F)
        val chart4 = Color(0xFF8A84E4)
        val chart5 = Color(0xFFFF5D69)
    }
}
