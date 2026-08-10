import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Navigation, TrendingDown, TrendingUp, Ruler } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RouteMap } from "@/components/RouteMap";
import { ElevationChart } from "@/components/ElevationChart";
import { OfflineSaveCard } from "@/components/OfflineSaveCard";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { directionsUrl, formatDistance, formatElevation } from "@/lib/gpx";
import { fetchProfile, fetchRide, ridesKeys } from "@/lib/rides";

export const Route = createFileRoute("/rides/$id/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Route details — Hodora" },
      {
        name: "description",
        content: "Route overview with map, elevation profile, distance and total climbing before you start navigating.",
      },
      { property: "og:title", content: "Route details — Hodora" },
      { property: "og:description", content: "Map, elevation profile and climbing for your imported GPX route." },
    ],
  }),
  component: RideDetail,
});

function RideDetail() {
  const { id } = Route.useParams();
  const { data: profile } = useQuery({ queryKey: ridesKeys.profile, queryFn: fetchProfile });
  const metric = profile?.unit !== "imperial";
  const { data: ride, isLoading, error } = useQuery({
    queryKey: ridesKeys.detail(id),
    queryFn: () => fetchRide(id),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/rides">
            <ArrowLeft className="size-4" />
            All rides
          </Link>
        </Button>

        {isLoading && <Skeleton className="mt-6 h-[420px] rounded-2xl" />}
        {error && (
          <p className="mt-8 text-sm text-destructive">
            That route couldn't be loaded.
          </p>
        )}

        {ride && (
          <>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">{ride.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Imported {new Date(ride.created_at).toLocaleDateString()}
                  {ride.source_filename ? ` · ${ride.source_filename}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {ride.points.length > 0 && (
                  <Button asChild variant="secondary" size="lg">
                    <a
                      href={directionsUrl(ride.points[0].lat, ride.points[0].lon)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MapPin className="size-4" />
                      Directions to start
                    </a>
                  </Button>
                )}
                <Button asChild size="lg" className="glow-ring">
                  <Link to="/rides/$id/nav" params={{ id: ride.id }}>
                    <Navigation className="size-4" />
                    Start navigation
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Stat
                icon={Ruler}
                label="Distance"
                value={formatDistance(ride.distance_m, metric)}
              />
              <Stat
                icon={TrendingUp}
                label="Ascent"
                value={formatElevation(ride.ascent_m, metric)}
              />
              <Stat
                icon={TrendingDown}
                label="Descent"
                value={formatElevation(ride.descent_m, metric)}
              />
            </div>

            <div className="surface mt-4 overflow-hidden">
              <RouteMap points={ride.points} className="h-[380px] w-full" />
            </div>

            <div className="mt-4">
              <OfflineSaveCard ride={ride} />
            </div>

            <div className="surface mt-4 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Elevation
              </h2>
              <div className="mt-4">
                <ElevationChart points={ride.points} metric={metric} height={200} />
              </div>
            </div>

          </>
        )}
      </main>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Ruler;
  label: string;
  value: string;
}) {
  return (
    <div className="surface p-4">
      <span className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <p className="mt-2 font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}
