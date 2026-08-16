import { ChevronLeft, ChevronRight, Mountain, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistance, formatElevation, type RidePoint } from "@/lib/gpx";
import { routeThumbnailPath } from "@/lib/routeThumbnail";
import { cn } from "@/lib/utils";

export function RouteCard({
  name,
  points,
  distanceM,
  elevationM,
  windScore,
  metric = true,
  onPrev,
  onNext,
  canPrev,
  canNext,
  className,
}: {
  name: string;
  points: RidePoint[] | null;
  distanceM: number;
  elevationM: number;
  windScore: number | null;
  metric?: boolean;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  className?: string;
}) {
  const path = points ? routeThumbnailPath(points) : null;
  return (
    <div className={cn("surface flex items-center gap-2 p-3", className)}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous route"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl bg-secondary/40 p-3">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-secondary">
          {path ? (
            <svg viewBox="0 0 96 64" className="size-14 text-primary">
              <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <Mountain className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold">{name}</p>
            {windScore !== null && <Badge variant="outline">{windScore}</Badge>}
          </div>
          <p className="mt-1 flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <Ruler className="size-3" />
            {formatDistance(distanceM, metric)} · {formatElevation(elevationM, metric)}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next route"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
