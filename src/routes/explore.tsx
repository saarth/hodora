import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Compass,
  Crosshair,
  Loader2,
  Repeat,
  Route as RouteIcon,
  Search,
  Signpost,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RouteMap } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistance } from "@/lib/gpx";
import {
  boundsOf,
  findNearbyRoutes,
  generateLoops,
  toRidePoints,
  type DiscoveredRoute,
} from "@/lib/discover";
import { createRide } from "@/lib/rides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/explore")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Explore routes near you — Hodora" },
      {
        name: "description",
        content:
          "Discover signposted cycle routes around you from OpenStreetMap, or generate a loop ride of any length, then save it to your rides.",
      },
      { property: "og:title", content: "Explore routes near you — Hodora" },
      {
        property: "og:description",
        content:
          "Find nearby cycle networks and generated loop rides, then save them and navigate turn by turn.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExplorePage,
});

type LatLon = { lat: number; lon: number };

const FALLBACK_CENTER: LatLon = { lat: 47.3769, lon: 8.5417 };

function ExplorePage() {
  const navigate = useNavigate();
  const [center, setCenter] = useState<LatLon>(FALLBACK_CENTER);
  const [radiusM, setRadiusM] = useState(15000);
  const [loopKm, setLoopKm] = useState(40);
  const [routes, setRoutes] = useState<DiscoveredRoute[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchedOnce, setSearchedOnce] = useState(false);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; nonce: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nonceRef = useRef(0);

  const selected = useMemo(
    () => routes.find((route) => route.id === selectedId) ?? null,
    [routes, selectedId],
  );

  const points = useMemo(
    () => (selected ? toRidePoints(selected.path) : []),
    [selected],
  );

  const search = useCallback(
    async (at: LatLon, radius: number, targetKm: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      setSearchedOnce(true);
      try {
        const [nearby, loops] = await Promise.all([
          findNearbyRoutes(at, radius, controller.signal).catch(() => []),
          generateLoops(at, targetKm * 1000, controller.signal).catch(() => []),
        ]);
        if (controller.signal.aborted) return;
        const found = [...loops, ...nearby];
        setRoutes(found);
        setSelectedId(found[0]?.id ?? null);
        if (found.length === 0) {
          toast.error("Nothing found here — try a wider area or another spot.");
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(
            error instanceof Error ? error.message : "Could not search this area",
          );
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    },
    [],
  );

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const at = { lat: position.coords.latitude, lon: position.coords.longitude };
        setLocating(false);
        setCenter(at);
        nonceRef.current += 1;
        setFlyTo({ ...at, nonce: nonceRef.current });
        void search(at, radiusM, loopKm);
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location — pan the map and search this area instead.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [loopKm, radiusM, search]);

  // Start from the rider's position when the page opens.
  useEffect(() => {
    locate();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (route: DiscoveredRoute) => {
      const ridePoints = toRidePoints(route.path);
      return createRide({
        name: route.name,
        sourceFilename: null,
        distanceM: route.distanceM,
        ascentM: 0,
        descentM: 0,
        bounds: boundsOf(route.path),
        points: ridePoints,
      });
    },
    onSuccess: (id) => {
      toast.success("Saved to your rides");
      navigate({ to: "/rides/$id", params: { id } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save that route"),
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Explore</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signposted cycle routes near you, plus loops built to the length you want.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/rides">
              <RouteIcon className="size-4" />
              My rides
            </Link>
          </Button>
        </div>

        <div className="surface mt-6 grid gap-5 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Search radius · {Math.round(radiusM / 1000)} km
            </span>
            <Slider
              className="mt-3"
              value={[radiusM / 1000]}
              min={2}
              max={40}
              step={1}
              onValueChange={([value]) => setRadiusM(value * 1000)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Loop length · {loopKm} km
            </span>
            <Slider
              className="mt-3"
              value={[loopKm]}
              min={10}
              max={150}
              step={5}
              onValueChange={([value]) => setLoopKm(value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={locate}
              disabled={locating || searching}
            >
              {locating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Crosshair className="size-4" />
              )}
              My location
            </Button>
            <Button
              className="glow-ring"
              onClick={() => void search(center, radiusM, loopKm)}
              disabled={searching}
            >
              {searching ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              Search this area
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="surface h-[380px] overflow-hidden p-0 lg:h-[520px]">
            <RouteMap
              points={points}
              initialCenter={center}
              flyTo={flyTo}
              onViewChange={(view) => setCenter(view.center)}
              showFitControl={points.length > 1}
              className="h-full w-full"
            />
          </div>

          <section className="grid gap-3 content-start">
            {searching &&
              [0, 1, 2].map((key) => <Skeleton key={key} className="h-20 rounded-2xl" />)}

            {!searching && routes.length === 0 && (
              <p className="surface p-6 text-center text-sm text-muted-foreground">
                {searchedOnce
                  ? "No routes here yet — widen the radius, or pan the map and search this area."
                  : "Finding routes around you…"}
              </p>
            )}

            {!searching &&
              routes.map((route) => {
                const active = route.id === selectedId;
                return (
                  <article
                    key={route.id}
                    className={cn(
                      "surface min-w-0 p-4 transition-colors",
                      active ? "border-primary/60" : "hover:border-primary/30",
                    )}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 text-left"
                      onClick={() => setSelectedId(route.id)}
                    >
                      <span className="mt-0.5 text-primary">
                        {route.kind === "loop" ? (
                          <Repeat className="size-5" />
                        ) : (
                          <Signpost className="size-5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{route.name}</span>
                        <span className="mt-1 block font-mono text-xs text-muted-foreground">
                          {formatDistance(route.distanceM)} · {route.subtitle}
                        </span>
                      </span>
                    </button>
                    {active && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveMutation.mutate(route)}
                          disabled={saveMutation.isPending}
                        >
                          {saveMutation.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Compass className="size-4" />
                          )}
                          Save to my rides
                        </Button>
                      </div>
                    )}
                  </article>
                );
              })}
          </section>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Route data © OpenStreetMap contributors. Generated loops follow bike-friendly
          roads and paths; check them before you ride.
        </p>
      </main>
    </div>
  );
}
