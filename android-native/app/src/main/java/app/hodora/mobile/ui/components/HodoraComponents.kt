package app.hodora.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.hodora.mobile.ui.theme.CaptionStyle
import app.hodora.mobile.ui.theme.LocalHodoraColors
import app.hodora.mobile.ui.theme.StatFigureStyle

// Shared building blocks that reproduce the design mockups pixel-for-pixel —
// see the "Hodora Native Android Mockups" design canvas. These intentionally
// bypass Material3's default Card/Button shapes, which don't match the
// mockups' 14dp-radius, bordered, softly-shadowed surfaces and full-width
// pill buttons.

private val CardShape = RoundedCornerShape(14.dp)

/** The web app's `.surface` card recipe: card fill, 1dp border, soft shadow. */
@Composable
fun HodoraCard(
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = CardShape,
    content: @Composable () -> Unit,
) {
    val colors = LocalHodoraColors.current
    Box(
        modifier =
            modifier
                .shadow(
                    elevation = 10.dp,
                    shape = shape,
                    ambientColor = colors.ink.copy(alpha = 0.16f),
                    spotColor = colors.ink.copy(alpha = 0.16f),
                )
                .clip(shape)
                .background(colors.card)
                .border(1.dp, colors.border, shape),
    ) {
        content()
    }
}

/** Tabular-figure mono text for stats (distance, speed, elapsed, ascent…). */
@Composable
fun StatFigure(
    text: String,
    modifier: Modifier = Modifier,
    fontSize: TextUnit = 20.sp,
    fontWeight: FontWeight = FontWeight.Medium,
    color: Color = LocalHodoraColors.current.ink,
) {
    Text(
        text = text,
        modifier = modifier,
        style = StatFigureStyle.copy(fontSize = fontSize, fontWeight = fontWeight, color = color),
    )
}

/** Uppercase, letter-spaced label above a stat figure ("DISTANCE", "ELAPSED"). */
@Composable
fun Caption(
    text: String,
    modifier: Modifier = Modifier,
) {
    val colors = LocalHodoraColors.current
    Text(
        text = text.uppercase(),
        modifier = modifier,
        style = CaptionStyle.copy(fontSize = 11.sp, color = colors.mutedInk),
    )
}

enum class HodoraButtonVariant { Primary, Outline, Destructive }

/** Full-width pill button in one of the mockups' three variants. */
@Composable
fun HodoraButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: HodoraButtonVariant = HodoraButtonVariant.Primary,
    height: Dp = 56.dp,
    enabled: Boolean = true,
    icon: (@Composable () -> Unit)? = null,
) {
    val colors = LocalHodoraColors.current
    val shape = RoundedCornerShape(14.dp)
    val background: Color
    val content: Color
    val border: Color?
    when (variant) {
        HodoraButtonVariant.Primary -> {
            background = colors.primary
            content = colors.primaryInk
            border = null
        }
        HodoraButtonVariant.Outline -> {
            background = colors.card
            content = colors.ink
            border = colors.border
        }
        HodoraButtonVariant.Destructive -> {
            background = colors.destructive
            content = colors.destructiveInk
            border = null
        }
    }
    val alpha = if (enabled) 1f else 0.5f
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .height(height)
                .then(
                    if (variant == HodoraButtonVariant.Primary) {
                        Modifier.shadow(
                            elevation = 14.dp,
                            shape = shape,
                            ambientColor = colors.primary.copy(alpha = 0.35f),
                            spotColor = colors.primary.copy(alpha = 0.35f),
                        )
                    } else {
                        Modifier
                    },
                )
                .clip(shape)
                .background(background.copy(alpha = alpha))
                .then(if (border != null) Modifier.border(1.dp, border, shape) else Modifier)
                .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) {
                CompositionLocalProvider(LocalContentColor provides content.copy(alpha = alpha)) {
                    icon()
                }
            }
            Text(
                text = text,
                color = content.copy(alpha = alpha),
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = MaterialTheme.typography.labelLarge.fontFamily,
                overflow = TextOverflow.Ellipsis,
                maxLines = 1,
            )
        }
    }
}

/** Small pill chip — the "REC" badge, the exit/back pills over a map hero, etc. */
@Composable
fun HodoraChip(
    modifier: Modifier = Modifier,
    background: Color = LocalHodoraColors.current.card.copy(alpha = 0.88f),
    contentColor: Color = LocalHodoraColors.current.ink,
    onClick: (() -> Unit)? = null,
    content: @Composable RowScope.() -> Unit,
) {
    val shape = RoundedCornerShape(50)
    Row(
        modifier =
            modifier
                .clip(shape)
                .background(background)
                .then(
                    if (onClick != null) {
                        Modifier.clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = onClick,
                        )
                    } else {
                        Modifier
                    },
                )
                .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CompositionLocalProvider(LocalContentColor provides contentColor) {
            content()
        }
    }
}
