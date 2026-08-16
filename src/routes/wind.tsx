import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PencilLine, Route as RouteIcon } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RouteMap } from "@/components/RouteMap";
import { WindStatsBar } from "@/components/WindStatsBar";
import { DayTabs } from "@/components/DayTabs";
import { HourPicker } from "@/components/HourPicker";
import { RouteCard } from "@/components/RouteCard";
import { AddRoutesPanel } from "@/components/AddRoutesPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { parseGpx } from "@/lib/gpx";
import { createRide, fetchProfile, fetchRide, fetchRides, ridesKeys } from "@/lib/rides";
import {
  closestHourIndex,
  fetchHourlyWind,
  groupForecastByDay,
  isDaytimeHour,
} from "@/lib/weather";
import { buildWindSegments, scoreRoute } from "@/lib/windScore";

export const Route = createFileRoute("/wind")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Wind planner — Hodora" },
      {
        name: "description",
        content:
          "Browse your saved routes with a wind-aware forecast: tailwind/headwind mix and a wind score for any hour ahead.",
      },
    ],
  }),
  component: WindPlannerPage,
});

function WindPlannerPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { data: profile } = useQuery({ queryKey: ridesKeys.profile, queryFn: fetchProfile });
  const metric = profile?.unit !== "imperial";

  const { data: summaries, isLoading: loadingSummaries } = useQuery({
    queryKey: ridesKeys.all,
    queryFn: fetchRides,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedSummary = summaries?.[selectedIndex] ?? null;

  const { data: ride } = useQuery({
    queryKey: selectedSummary ? ridesKeys.detail(selectedSummary.id) : ["wind-selected-ride", null],
    queryFn: () => fetchRide(selectedSummary!.id),
    enabled: Boolean(selectedSummary),
  });

  const start = ride?.points[0];
  const { data: hourly } = useQuery({
    queryKey: ["ride-wind-forecast", ride?.id, start?.lat, start?.lon],
    queryFn: () => fetchHourlyWind(start!.lat, start!.lon),
    enabled: Boolean(start),
    staleTime: 10 * 60 * 1000,
  });

  const days = useMemo(() => groupForecastByDay(hourly ?? []), [hourly]);
  // A stale key from a previously viewed route falls back to today's
  // forecast below (`?? days[0]`) if it no longer matches, so switching
  // routes doesn't need its own reset — it just re-resolves against the
  // new route's forecast.
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedHourIso, setSelectedHourIso] = useState<string | null>(null);

  const selectedDay = days.find((day) => day.dateKey === selectedDayKey) ?? days[0] ?? null;
  const selectedHour =
    selectedDay?.hours.find((hour) => hour.atIso === selectedHourIso) ??
    (selectedDay ? selectedDay.hours[closestHourIndex(selectedDay.hours)] : null);

  const dayScores = useMemo(() => {
    const map = new Map<string, number>();
    if (!ride || !selectedDay) return map;
    for (const hour of selectedDay.hours) {
      const result = scoreRoute(ride.points, {
        windSpeedMs: hour.windSpeedMs,
        windDirectionDeg: hour.windDirectionDeg,
      });
      if (result) map.set(hour.atIso, result.windScore);
    }
    return map;
  }, [ride, selectedDay]);

  const bestHourIso = useMemo(() => {
    let best: string | null = null;
    let bestScore = -Infinity;
    for (const [atIso, hourScore] of dayScores) {
      if (hourScore > bestScore) {
        bestScore = hourScore;
        best = atIso;
      }
    }
    return best;
  }, [dayScores]);

  const windScore = useMemo(() => {
    if (!ride || !selectedHour) return null;
    return scoreRoute(ride.points, {
      windSpeedMs: selectedHour.windSpeedMs,
      windDirectionDeg: selectedHour.windDirectionDeg,
    });
  }, [ride, selectedHour]);

  const windSegments = useMemo(() => {
    if (!ride || !selectedHour) return null;
    return buildWindSegments(ride.points, {
      windSpeedMs: selectedHour.windSpeedMs,
      windDirectionDeg: selectedHour.windDirectionDeg,
    });
  }, [ride, selectedHour]);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const parsed = parseGpx(text, file.name.replace(/\.gpx$/i, ""));
      return createRide({
        name: parsed.name,
        sourceFilename: file.name,
        distanceM: parsed.distanceM,
        ascentM: parsed.ascentM,
        descentM: parsed.descentM,
        bounds: parsed.bounds,
        points: parsed.points,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ridesKeys.all });
      toast.success("Route imported");
      // fetchRides orders newest-first, so the just-imported route is index 0.
      setSelectedIndex(0);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not import that file");
    },
  });

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
      if (ext && !["gpx", "xml", "txt"].includes(ext)) {
        toast.error("Please choose a .gpx file");
        return;
      }
      importMutation.mutate(file);
    },
    [importMutation],
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Wind planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See how the wind lines up with your route, hour by hour.
        </p>

        {loadingSummaries && <Skeleton className="mt-6 h-[420px] rounded-2xl" />}

        {!loadingSummaries && summaries?.length === 0 && (
          <div className="mt-6">
            <AddRoutesPanel
              onUploadClick={() => inputRef.current?.click()}
              uploading={importMutation.isPending}
            />
          </div>
        )}

        {ride && (
          <>
            <div className="surface relative mt-6 overflow-hidden">
              <RouteMap
                points={ride.points}
                className="h-[420px] w-full"
                windSegments={windSegments}
              />
            </div>

            {windScore && selectedHour && (
              <div className="mt-4 space-y-3">
                <WindStatsBar
                  score={windScore}
                  windDirectionDeg={selectedHour.windDirectionDeg}
                  metric={metric}
                  detail={{
                    distanceM: ride.distance_m,
                    elevationM: ride.ascent_m,
                    temperatureC: selectedHour.temperatureC,
                    weatherCode: selectedHour.weatherCode,
                    isDay: isDaytimeHour(selectedHour.atIso),
                  }}
                />
                {days.length > 0 && selectedDay && (
                  <div className="space-y-2">
                    <DayTabs
                      days={days}
                      value={selectedDay.dateKey}
                      onChange={(dateKey) => {
                        setSelectedDayKey(dateKey);
                        setSelectedHourIso(null);
                      }}
                    />
                    <HourPicker
                      hours={selectedDay.hours}
                      value={selectedHour.atIso}
                      onChange={setSelectedHourIso}
                      bestAtIso={bestHourIso}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {summaries && summaries.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
            <div className="surface flex shrink-0 items-center gap-1 p-2 sm:flex-col">
              <Link
                to="/rides"
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="All routes"
                title="All routes"
              >
                <RouteIcon className="size-4" />
              </Link>
              <Link
                to="/plan"
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Draw a route"
                title="Draw a route"
              >
                <PencilLine className="size-4" />
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <RouteCard
                name={selectedSummary?.name ?? ""}
                points={ride?.points ?? null}
                distanceM={selectedSummary?.distance_m ?? 0}
                elevationM={selectedSummary?.ascent_m ?? 0}
                windScore={windScore?.windScore ?? null}
                metric={metric}
                canPrev={selectedIndex > 0}
                canNext={selectedIndex < summaries.length - 1}
                onPrev={() => setSelectedIndex((i) => Math.max(0, i - 1))}
                onNext={() => setSelectedIndex((i) => Math.min(summaries.length - 1, i + 1))}
              />
              <AddRoutesPanel
                onUploadClick={() => inputRef.current?.click()}
                uploading={importMutation.isPending}
              />
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="*/*"
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </main>
    </div>
  );
}
