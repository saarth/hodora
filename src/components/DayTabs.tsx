import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ForecastDay } from "@/lib/weather";
import { cn } from "@/lib/utils";

export function DayTabs({
  days,
  value,
  onChange,
  className,
}: {
  days: ForecastDay[];
  value: string;
  onChange: (dateKey: string) => void;
  className?: string;
}) {
  if (days.length === 0) return null;
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next)}
      className={cn("flex-nowrap justify-start overflow-x-auto", className)}
    >
      {days.map((day) => (
        <ToggleGroupItem
          key={day.dateKey}
          value={day.dateKey}
          variant="outline"
          className="shrink-0 px-4"
        >
          {day.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
