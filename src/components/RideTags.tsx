import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RideDifficulty, RideSurface } from "@/lib/rides";

export const DIFFICULTY_OPTIONS: {
  value: RideDifficulty;
  label: string;
  toggleClass: string;
  badgeClass: string;
}[] = [
  {
    value: "easy",
    label: "Easy",
    toggleClass: "data-[state=on]:bg-primary/15 data-[state=on]:text-primary",
    badgeClass: "border-primary/30 bg-primary/10 text-primary",
  },
  {
    value: "moderate",
    label: "Moderate",
    toggleClass: "data-[state=on]:bg-chart-3/15 data-[state=on]:text-chart-3",
    badgeClass: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  },
  {
    value: "hard",
    label: "Hard",
    toggleClass: "data-[state=on]:bg-warning/15 data-[state=on]:text-warning",
    badgeClass: "border-warning/30 bg-warning/10 text-warning",
  },
  {
    value: "extreme",
    label: "Extreme",
    toggleClass: "data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive",
    badgeClass: "border-destructive/30 bg-destructive/10 text-destructive",
  },
];

export const SURFACE_OPTIONS: { value: RideSurface; label: string }[] = [
  { value: "paved", label: "Paved" },
  { value: "gravel", label: "Gravel" },
  { value: "mixed", label: "Mixed" },
  { value: "unpaved", label: "Unpaved" },
];

export function DifficultyBadge({ value }: { value: RideDifficulty }) {
  const option = DIFFICULTY_OPTIONS.find((o) => o.value === value);
  if (!option) return null;
  return (
    <Badge variant="outline" className={cn("font-semibold", option.badgeClass)}>
      {option.label}
    </Badge>
  );
}

export function SurfaceBadge({ value }: { value: RideSurface }) {
  const option = SURFACE_OPTIONS.find((o) => o.value === value);
  if (!option) return null;
  return <Badge variant="outline">{option.label}</Badge>;
}
