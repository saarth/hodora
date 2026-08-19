package app.hodora.mobile.ui.ridedetail

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.unit.dp
import app.hodora.mobile.gpx.RidePoint

/**
 * A minimal elevation-vs-distance area chart — stands in for recharts
 * (src/components/ElevationChart.tsx isn't ported yet) without pulling in a
 * third-party Compose charting library for one shape.
 */
@Composable
fun ElevationProfile(
    points: List<RidePoint>,
    modifier: Modifier = Modifier,
) {
    val lineColor = MaterialTheme.colorScheme.primary
    val fillColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.18f)

    Canvas(modifier = modifier.fillMaxWidth().height(120.dp)) {
        if (points.size < 2) return@Canvas

        val minEle = points.minOf { it.ele }
        val maxEle = points.maxOf { it.ele }
        val eleRange = (maxEle - minEle).coerceAtLeast(1.0)
        val maxDistance = points.last().d.coerceAtLeast(1)

        fun xFor(d: Int) = size.width * (d.toFloat() / maxDistance)
        fun yFor(ele: Double) = size.height - size.height * ((ele - minEle) / eleRange).toFloat()

        val line = Path()
        val fill = Path()
        points.forEachIndexed { i, p ->
            val x = xFor(p.d)
            val y = yFor(p.ele)
            if (i == 0) {
                line.moveTo(x, y)
                fill.moveTo(x, size.height)
                fill.lineTo(x, y)
            } else {
                line.lineTo(x, y)
                fill.lineTo(x, y)
            }
        }
        fill.lineTo(xFor(points.last().d), size.height)
        fill.close()

        drawPath(fill, color = fillColor, style = Fill)
        drawPath(line, color = lineColor, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 3f))
    }
}
