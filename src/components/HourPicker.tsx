import { Star } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatHourLabel, type HourlyForecast } from "@/lib/weather";
import { cn } from "@/lib/utils";

export function HourPicker({
  hours,
  value,
  onChange,
  bestAtIso,
  className,
}: {
  hours: HourlyForecast[];
  value: string;
  onChange: (atIso: string) => void;
  /** the hour with the best wind score for this day, marked with a star */
  bestAtIso?: string | null;
  className?: string;
}) {
  if (hours.length === 0) return null;
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next)}
      className={cn("flex-nowrap justify-start overflow-x-auto", className)}
    >
      {hours.map((hour) => (
        <ToggleGroupItem
          key={hour.atIso}
          value={hour.atIso}
          variant="outline"
          className="shrink-0 gap-1 px-3"
        >
          {hour.atIso === bestAtIso && <Star className="size-3 fill-warning text-warning" />}
          {formatHourLabel(hour.atIso)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
