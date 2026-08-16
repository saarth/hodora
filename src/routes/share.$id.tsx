import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Navigation, Radio } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RouteMap } from "@/components/RouteMap";
import { WindStatsBar } from "@/components/WindStatsBar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toGpx, type RidePoint } from "@/lib/gpx";
import { fetchProfile } from "@/lib/rides";
import { buildWindSegments, scoreRoute } from "@/lib/windScore";

type SharedRide = {
  id: string;
  name: string;
  points: RidePoint[];
  distanceM: number;
  ascentM: number;
  descentM: number;
};

type SharedWind = {
  hour: string | null;
  speedMs: number | null;
  directionDeg: number | null;
  temperatureC: number | null;
  weatherCode: number | null;
};

type SharePayload = {
  ride: SharedRide;
  wind: SharedWind;
  sharedAt: string;
};

async function fetchSharedRide(token: string): Promise<SharePayload> {
  const response = await fetch(`/api/share/${token}`);
  if (!response.ok) throw new Error("Share link not found");
  return response.json();
}

function formatSharedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const Route = createFileRoute("/share/$id")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Shared route — Hodora" },
      {
        name: "description",
        content: "A shared route with a wind analysis for a chosen ride time.",
      },
    ],
  }),
  component: SharedRoutePage,
});

function SharedRoutePage() {
  const { id: token } = Route.useParams();
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: fetchProfile });
  const metric = profile?.unit !== "imperial";

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-ride", token],
    queryFn: () => fetchSharedRide(token),
  });

  const ride = data?.ride;
  const wind = data?.wind;
  const hasWindSample = Boolean(wind && wind.speedMs !== null && wind.directionDeg !== null);

  const windScore = useMemo(() => {
    if (!ride || !wind || !hasWindSample) return null;
    return scoreRoute(ride.points, {
      windSpeedMs: wind.speedMs!,
      windDirectionDeg: wind.directionDeg!,
    });
  }, [ride, wind, hasWindSample]);

  const windSegments = useMemo(() => {
    if (!ride || !wind || !hasWindSample) return null;
    return buildWindSegments(ride.points, {
      windSpeedMs: wind.speedMs!,
      windDirectionDeg: wind.directionDeg!,
    });
  }, [ride, wind, hasWindSample]);

  function handleDownloadGpx() {
    if (!ride) return;
    const blob = new Blob([toGpx({ name: ride.name, points: ride.points })], {
      type: "application/gpx+xml",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${ride.name || "route"}.gpx`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6">
        {isLoading && <Skeleton className="mt-4 h-[420px] rounded-2xl" />}
        {error && (
          <p className="mt-8 text-sm text-destructive">
            That shared route couldn't be found — the link may have expired or been removed.
          </p>
        )}

        {ride && (
          <>
            <div className="surface flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <Radio className="size-3.5" />
                  Shared route
                </span>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{ride.name}</h1>
                {(wind?.hour || data?.sharedAt) && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatSharedAt(wind?.hour ?? data!.sharedAt)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="lg" onClick={handleDownloadGpx}>
                  <Download className="size-4" />
                  GPX
                </Button>
                <Button asChild size="lg" className="glow-ring">
                  <Link to="/plan">
                    <Navigation className="size-4" />
                    Plan your ride
                  </Link>
                </Button>
              </div>
            </div>

            {windScore && hasWindSample && wind && (
              <div className="mt-4">
                <WindStatsBar
                  score={windScore}
                  windDirectionDeg={wind.directionDeg!}
                  metric={metric}
                  defaultExpanded
                  detail={{
                    distanceM: ride.distanceM,
                    elevationM: ride.ascentM,
                    temperatureC: wind.temperatureC ?? 0,
                    weatherCode: wind.weatherCode ?? 0,
                    isDay: true,
                  }}
                />
              </div>
            )}

            <div className="surface relative mt-4 overflow-hidden">
              <RouteMap
                points={ride.points}
                className="h-[420px] w-full"
                windSegments={windSegments}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
