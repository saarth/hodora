import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDistance, formatElevation, type RidePoint } from "@/lib/gpx";

type ElevationChartProps = {
  points: RidePoint[];
  metric?: boolean;
  progressM?: number | null;
  height?: number;
};

export function ElevationChart({
  points,
  metric = true,
  progressM = null,
  height = 180,
}: ElevationChartProps) {
  const data = points.map((p) => ({
    d: p.d,
    ele: metric ? Math.round(p.ele) : Math.round(p.ele * 3.28084),
  }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="eleFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="d"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => formatDistance(v, metric)}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            dataKey="ele"
            width={44}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            domain={["dataMin - 10", "dataMax + 10"]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              color: "var(--color-popover-foreground)",
              fontSize: 12,
            }}
            labelFormatter={(v: number) => formatDistance(v, metric)}
            formatter={(v: number) => [
              metric ? `${v} m` : `${v} ft`,
              "Elevation",
            ]}
          />
          {progressM != null && (
            <ReferenceLine
              x={progressM}
              stroke="var(--color-primary)"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          )}
          <Area
            type="monotone"
            dataKey="ele"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            fill="url(#eleFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ElevationSummary({
  ascent,
  descent,
  metric = true,
}: {
  ascent: number;
  descent: number;
  metric?: boolean;
}) {
  return (
    <span className="text-sm text-muted-foreground">
      ↑ {formatElevation(ascent, metric)} · ↓ {formatElevation(descent, metric)}
    </span>
  );
}
