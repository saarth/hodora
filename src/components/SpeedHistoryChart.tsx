import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDuration, formatSpeed } from "@/lib/gpx";

export type SpeedSample = { tSec: number; speedMps: number };

export function SpeedHistoryChart({
  samples,
  metric = true,
  height = 70,
}: {
  samples: SpeedSample[];
  metric?: boolean;
  height?: number;
}) {
  if (samples.length < 2) return null;

  const data = samples.map((s) => ({
    tSec: s.tSec,
    speed: Number(formatSpeed(s.speedMps, metric)),
  }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="speedFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-chart-2)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--color-chart-2)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="tSec"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => formatDuration(v)}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            dataKey="speed"
            width={30}
            tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            domain={[0, "dataMax + 2"]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-popover)",
              border: "1px solid var(--color-border)",
              borderRadius: "12px",
              color: "var(--color-popover-foreground)",
              fontSize: 12,
            }}
            labelFormatter={(v) => formatDuration(Number(v))}
            formatter={(v) => [`${v} ${metric ? "km/h" : "mph"}`, "Speed"]}
          />
          <Area
            type="monotone"
            dataKey="speed"
            stroke="var(--color-chart-2)"
            strokeWidth={2}
            fill="url(#speedFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
