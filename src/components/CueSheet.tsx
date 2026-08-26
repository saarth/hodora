import {
  ArrowUp,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  GitFork,
  GitMerge,
  MapPin,
  RefreshCw,
  Undo2,
} from "lucide-react";
import type { CueDirection, CueSheetEntry } from "@/lib/cues";
import { formatDistance } from "@/lib/gpx";
import { cn } from "@/lib/utils";

const ICONS: Record<CueDirection, typeof ArrowUp> = {
  depart: MapPin,
  arrive: Flag,
  left: CornerUpLeft,
  "sharp-left": CornerUpLeft,
  "slight-left": CornerUpLeft,
  right: CornerUpRight,
  "sharp-right": CornerUpRight,
  "slight-right": CornerUpRight,
  straight: ArrowUp,
  uturn: Undo2,
  roundabout: RefreshCw,
  merge: GitMerge,
  fork: GitFork,
  other: ArrowUp,
};

export function CueSheet({
  entries,
  metric,
  progressM,
}: {
  entries: CueSheetEntry[];
  metric: boolean;
  /** current distance along the route, if navigating — dims/highlights entries relative to it */
  progressM?: number | null;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No turns to show for this route.</p>;
  }

  return (
    <ol className="divide-y divide-border">
      {entries.map((entry, index) => {
        const Icon = ICONS[entry.direction];
        const passed = progressM != null && entry.atM < progressM - 15;
        return (
          <li
            key={`${entry.atM}-${index}`}
            className={cn(
              "flex items-center gap-3 py-2.5 text-sm",
              passed && "text-muted-foreground opacity-60",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                entry.direction === "arrive"
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary text-foreground",
              )}
              aria-hidden
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">{entry.text}</span>
            {index > 0 && (
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {formatDistance(entry.legM, metric)}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
