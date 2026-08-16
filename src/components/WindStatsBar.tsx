import { useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Compass,
  Navigation2,
  TrendingUp,
  Wind,
} from "lucide-react";
import { WeatherGlyph } from "@/components/WeatherGlyph";
import { formatDistance, formatElevation } from "@/lib/gpx";
import { compassAbbrev, windArrowRotation, type WindScoreResult } from "@/lib/windScore";
import {
  formatTemperature,
  formatWindSpeed,
  weatherInfo,
  type WeatherIconKey,
} from "@/lib/weather";
import { cn } from "@/lib/utils";

export type WindStatsBarDetail = {
  distanceM: number;
  elevationM: number;
  temperatureC: number;
  weatherCode: number;
  isDay: boolean;
};

function scoreTone(score: number): string {
  if (score >= 65) return "text-primary";
  if (score <= 35) return "text-destructive";
  return "text-warning";
}

export function WindStatsBar({
  score,
  windDirectionDeg,
  metric = true,
  detail,
  defaultExpanded = false,
  className,
}: {
  score: WindScoreResult;
  windDirectionDeg: number;
  metric?: boolean;
  detail?: WindStatsBarDetail;
  defaultExpanded?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const canExpand = Boolean(detail);
  const conditions = detail ? weatherInfo(detail.weatherCode, detail.isDay) : null;
  const meanKmh = score.meanComponentMs * 3.6;

  return (
    <div className={cn("glass rounded-2xl", className)}>
      <div className="flex items-center gap-2 divide-x divide-border/60 px-3 py-3 sm:px-4">
        <StatCell
          icon={<Wind className="size-4 text-muted-foreground" />}
          label="Speed"
          value={formatWindSpeed(score.avgWindSpeedMs, metric)}
        />
        <StatCell
          icon={
            <Navigation2
              className="size-4 text-muted-foreground"
              style={{ transform: `rotate(${windArrowRotation(windDirectionDeg)}deg)` }}
            />
          }
          label="Direction"
          value={compassAbbrev(windDirectionDeg)}
        />
        <StatCell
          label="Wind Score"
          value={String(score.windScore)}
          valueClassName={cn("text-3xl", scoreTone(score.windScore))}
          emphasized
        />
        <StatCell
          icon={<TrendingUp className="size-4 text-primary" />}
          label="Tailwind %"
          value={`${score.tailwindPct}%`}
        />
        <StatCell
          icon={<ArrowLeftRight className="size-4 text-warning" />}
          label="Crosswind %"
          value={`${score.crosswindPct}%`}
        />
        {canExpand && (
          <button
            type="button"
            aria-label={expanded ? "Collapse wind details" : "Expand wind details"}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="flex shrink-0 items-center justify-center pl-3 text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        )}
      </div>

      {canExpand && expanded && detail && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border/60 px-4 py-4 text-sm">
          <DetailRow
            icon={Wind}
            label="Avg wind"
            value={formatWindSpeed(score.avgWindSpeedMs, metric)}
          />
          <DetailRow
            icon={ArrowLeftRight}
            label="Crosswind"
            value={formatWindSpeed(score.meanCrosswindMs, metric)}
          />
          <DetailRow icon={TrendingUp} label="Tailwind" value={`${score.tailwindPct}% of route`} />
          <DetailRow icon={Wind} label="Headwind" value={`${score.headwindPct}% of route`} />
          <DetailRow
            icon={Compass}
            label="Crosswind share"
            value={`${score.crosswindPct}% of route`}
          />
          <DetailRow
            icon={meanKmh < 0 ? ArrowDown : ArrowUp}
            label="Mean head/tail"
            value={`${meanKmh >= 0 ? "" : "-"}${formatWindSpeed(Math.abs(score.meanComponentMs), metric)}`}
          />
          <DetailRow
            icon={Wind}
            label="Distance"
            value={formatDistance(detail.distanceM, metric)}
          />
          <DetailRow
            icon={Wind}
            label="Elevation"
            value={formatElevation(detail.elevationM, metric)}
          />
          <DetailRow
            icon={Wind}
            label="Temperature"
            value={formatTemperature(detail.temperatureC, metric)}
          />
          {conditions && <ConditionsRow icon={conditions.icon} label={conditions.label} />}
        </div>
      )}
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  valueClassName,
  emphasized,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2 text-center first:pl-0",
        emphasized && "flex-[1.4]",
      )}
    >
      {icon}
      <span className={cn("font-mono text-lg font-bold leading-none", valueClassName)}>
        {value}
      </span>
      <span className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wind;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="font-mono text-sm font-semibold">{value}</span>
    </div>
  );
}

function ConditionsRow({ icon, label }: { icon: WeatherIconKey; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted-foreground">
        <WeatherGlyph icon={icon} className="size-3.5" />
        Conditions
      </span>
      <span className="font-mono text-sm font-semibold">{label}</span>
    </div>
  );
}
