package com.hodora.app.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.hodora.app.data.format.Formatters
import com.hodora.app.data.model.RidePoint
import com.hodora.app.ui.theme.HodoraTheme
import com.hodora.app.ui.theme.StatFigureStyle
import kotlin.math.roundToInt

private data class ChartPoint(val d: Double, val ele: Double)

/**
 * Custom Canvas port of src/components/ElevationChart.tsx — gradient area
 * chart, distance-formatted x ticks, 10-unit y padding, drag-to-inspect
 * tooltip, and an optional dashed reference line at the live nav progress.
 */
@Composable
fun ElevationChart(
    points: List<RidePoint>,
    metric: Boolean,
    modifier: Modifier = Modifier,
    progressM: Double? = null,
) {
    if (points.size < 2) return

    val chartData = remember(points, metric) {
        points.map { p ->
            val ele = if (metric) p.ele else p.ele * 3.28084
            ChartPoint(p.d, Math.round(ele).toDouble())
        }
    }
    val xMin = chartData.first().d
    val xMax = chartData.last().d
    val yMin = (chartData.minOf { it.ele } - 10)
    val yMax = (chartData.maxOf { it.ele } + 10)

    val extraColors = HodoraTheme.extraColors
    val areaColor = extraColors.chart1
    val primaryColor = MaterialTheme.colorScheme.primary
    val mutedColor = MaterialTheme.colorScheme.onSurfaceVariant

    var dragOffsetX by remember { mutableStateOf<Float?>(null) }
    val density = LocalDensity.current

    BoxWithConstraints(modifier) {
        val yAxisWidthPx = with(density) { 44.dp.toPx() }
        val xAxisHeightPx = with(density) { 18.dp.toPx() }
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        val plotLeft = yAxisWidthPx
        val plotWidth = (widthPx - yAxisWidthPx).coerceAtLeast(1f)
        val plotHeight = (heightPx - xAxisHeightPx).coerceAtLeast(1f)

        fun xToPx(d: Double): Float = plotLeft + ((d - xMin) / (xMax - xMin).coerceAtLeast(1.0)).toFloat() * plotWidth
        fun yToPx(ele: Double): Float = ((yMax - ele) / (yMax - yMin).coerceAtLeast(1.0)).toFloat() * plotHeight
        fun pxToD(x: Float): Double = xMin + ((x - plotLeft) / plotWidth).toDouble().coerceIn(0.0, 1.0) * (xMax - xMin)

        val nearestIndex = dragOffsetX?.let { x ->
            nearestIndexForDistance(chartData, pxToD(x))
        }

        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .pointerInput(chartData) {
                    detectDragGestures(
                        onDragStart = { offset -> dragOffsetX = offset.x },
                        onDrag = { change, _ -> dragOffsetX = change.position.x },
                        onDragEnd = { dragOffsetX = null },
                        onDragCancel = { dragOffsetX = null },
                    )
                },
        ) {
            // Gradient area fill.
            val path = androidx.compose.ui.graphics.Path()
            path.moveTo(xToPx(chartData.first().d), plotHeight)
            chartData.forEach { p -> path.lineTo(xToPx(p.d), yToPx(p.ele)) }
            path.lineTo(xToPx(chartData.last().d), plotHeight)
            path.close()
            drawPath(
                path = path,
                brush = Brush.verticalGradient(
                    colors = listOf(areaColor.copy(alpha = 0.55f), areaColor.copy(alpha = 0.04f)),
                    startY = 0f,
                    endY = plotHeight,
                ),
            )

            // Line on top of the fill.
            val linePath = androidx.compose.ui.graphics.Path()
            chartData.forEachIndexed { i, p ->
                val x = xToPx(p.d)
                val y = yToPx(p.ele)
                if (i == 0) linePath.moveTo(x, y) else linePath.lineTo(x, y)
            }
            drawPath(path = linePath, color = areaColor, style = Stroke(width = 2.dp.toPx()))

            // Progress reference line (dashed).
            if (progressM != null && progressM in xMin..xMax) {
                val x = xToPx(progressM)
                drawLine(
                    color = primaryColor,
                    start = Offset(x, 0f),
                    end = Offset(x, plotHeight),
                    strokeWidth = 2.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 4f)),
                )
            }

            // Drag scrub line.
            nearestIndex?.let { idx ->
                val x = xToPx(chartData[idx].d)
                drawLine(
                    color = mutedColor,
                    start = Offset(x, 0f),
                    end = Offset(x, plotHeight),
                    strokeWidth = 1.dp.toPx(),
                )
            }
        }

        // Y-axis labels (max at top, min at bottom of plot area).
        Text(
            text = "${yMax.roundToInt()}",
            style = MaterialTheme.typography.labelSmall,
            color = mutedColor,
            modifier = Modifier.padding(start = 2.dp, top = 0.dp),
        )
        Text(
            text = "${yMin.roundToInt()}",
            style = MaterialTheme.typography.labelSmall,
            color = mutedColor,
            modifier = Modifier.offset(x = 2.dp, y = with(density) { (plotHeight).toDp() } - 14.dp),
        )

        // X-axis ticks: start / mid / end, distance-formatted.
        listOf(0.0, 0.5, 1.0).forEach { fraction ->
            val d = xMin + fraction * (xMax - xMin)
            val xPx = xToPx(d)
            Text(
                text = Formatters.distance(d, metric),
                style = MaterialTheme.typography.labelSmall,
                color = mutedColor,
                modifier = Modifier.offset(
                    x = with(density) { xPx.toDp() } - 16.dp,
                    y = with(density) { plotHeight.toDp() },
                ),
            )
        }

        // Tooltip.
        nearestIndex?.let { idx ->
            val p = chartData[idx]
            val xPx = xToPx(p.d)
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 4.dp,
                modifier = Modifier.offset(
                    x = with(density) { xPx.toDp() } - 40.dp,
                    y = (-8).dp,
                ),
            ) {
                Text(
                    text = "${Formatters.distance(p.d, metric)} · ${p.ele.roundToInt()}${if (metric) "m" else "ft"}",
                    style = StatFigureStyle.copy(fontSize = 12.sp),
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
    }
}

private fun nearestIndexForDistance(data: List<ChartPoint>, targetD: Double): Int {
    var lo = 0
    var hi = data.size - 1
    while (lo < hi) {
        val mid = (lo + hi) / 2
        if (data[mid].d < targetD) lo = mid + 1 else hi = mid
    }
    if (lo > 0 && Math.abs(data[lo - 1].d - targetD) < Math.abs(data[lo].d - targetD)) return lo - 1
    return lo
}

/** Small "↑ ascent · ↓ descent" helper — port of ElevationSummary in ElevationChart.tsx. */
@Composable
fun ElevationSummary(ascentM: Double, descentM: Double, metric: Boolean, modifier: Modifier = Modifier) {
    Text(
        text = "↑ ${Formatters.elevation(ascentM, metric)} · ↓ ${Formatters.elevation(descentM, metric)}",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier,
    )
}
