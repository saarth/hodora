package app.hodora.mobile.ui.theme

import androidx.compose.ui.graphics.Color

// Hodora's design tokens, converted from src/styles.css's oklch custom
// properties to sRGB. Keep these two palettes in sync with that file's
// `:root` (light) and `.dark` blocks if the web app's palette changes.

// Light
val LightBg = Color(0xFFF2ECDC)
val LightInk = Color(0xFF1A1815)
val LightCard = Color(0xFFF9F7F1)
val LightElevated = Color(0xFFEAE2CC)
val LightPrimary = Color(0xFF1F3A2E) // racing green
val LightPrimaryInk = Color(0xFFF7F3E9)
val LightMutedInk = Color(0xFF53595C)
val LightAccent = Color(0xFFF7D7C2)
val LightAccentInk = Color(0xFF743100)
val LightDestructive = Color(0xFFC92F33)
val LightDestructiveInk = Color(0xFFFBF8F1)
val LightBorder = Color(0x211A1815)

// Dark
val DarkBg = Color(0xFF061810)
val DarkInk = Color(0xFFF2ECDC)
val DarkCard = Color(0xFF102A1F)
val DarkElevated = Color(0xFF1D3A2D)
val DarkPrimary = Color(0xFFC9A15D) // brass
val DarkPrimaryInk = Color(0xFF1A1815)
val DarkMutedInk = Color(0xFFBBB7AB)
val DarkAccent = Color(0xFF5E3721)
val DarkAccentInk = Color(0xFFFBE0C1)
val DarkDestructive = Color(0xFFE24947)
val DarkDestructiveInk = Color(0xFFFBF8F1)
val DarkBorder = Color(0x24F9F5EB)

// Brand constants — fixed rust/brass, independent of light/dark surface
// (src/styles.css's --brand-rust / --brand-brass).
val Brass = Color(0xFFC9A15D)
val Rust = Color(0xFFB5622F)
