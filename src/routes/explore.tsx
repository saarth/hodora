import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Loader2,
  Maximize2,
  Repeat,
  Route as RouteIcon,
  Search,
  Signpost,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RouteMap } from "@/components/RouteMap";
import {
  MapCard,
  MapOverlay,
  MapPanel,
  MapRail,
  MapRailButton,
  MapScreen,
  MapStage,
  MapToolbar,
} from "@/components/MapScreen";
import { ElevationChart } from "@/components/ElevationChart";
import { PlaceSearch } from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { computeAscentDescent, formatDistance, formatElevation } from "@/lib/gpx";
import {
  boundsOf,
  findNearbyRoutes,
  generateLoops,
  toRidePoints,
  type DiscoveredRoute,
} from "@/lib/discover";
import { createRide } from "@/lib/rides";
import { cn } from "@/lib/utils";
import { absoluteUrl, canonicalLink } from "@/lib/seo";

const TITLE = "Bike Trails Near Me — Explore Cycle Routes | Hodora";
const DESCRIPTION =
  "Find bike trails and cycle routes near you from OpenStreetMap, or generate a loop ride of any distance. Discover mountain bike trails and cycling routes nearby, then save and navigate them.";

export const Route = createFileRoute("/explore")({
  ssr: false,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: absoluteUrl("/explore") },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: canonicalLink("/explore"),
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
  const [panelOpen, setPanelOpen] = useState(true);
  // Bumped to re-frame the camera around the selected route; the map only
  // reacts to a new `nonce`, so re-fitting the same coords still works.
  const [fitTo, setFitTo] = useState<{
    coords: { lat: number; lon: number }[];
    nonce: number;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nonceRef = useRef(0);

  const selected = useMemo(
    () => routes.find((route) => route.id === selectedId) ?? null,
    [routes, selectedId],
  );

  const points = useMemo(() => (selected ? toRidePoints(selected.path) : []), [selected]);

  const search = useCallback(async (at: LatLon, radius: number, targetKm: number) => {
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
        toast.error(error instanceof Error ? error.message : "Could not search this area");
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, []);

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
    // Kicks off geolocation on mount (locate() sets the loading flag
    // synchronously before its async callback resolves) — not a value
    // derived from props/state, so there's no callback to move it into.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    locate();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (route: DiscoveredRoute) => {
      const ridePoints = toRidePoints(route.path);
      const { ascentM, descentM } = computeAscentDescent(ridePoints);
      return createRide({
        name: route.name,
        sourceFilename: null,
        distanceM: route.distanceM,
        ascentM,
        descentM,
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

  const fitRoute = () => {
    if (points.length < 2) return;
    setFitTo({
      coords: points.map((point) => ({ lat: point.lat, lon: point.lon })),
      nonce: Date.now(),
    });
  };

  return (
    <MapScreen>
      <AppHeader />

      <MapStage>
        <RouteMap
          points={points}
          initialCenter={center}
          flyTo={flyTo}
          fitTo={fitTo}
          onViewChange={(view) => setCenter(view.center)}
          className="absolute inset-0 h-full w-full"
          /* Both live on the rail instead: the built-in fit button and
             MapLibre's zoom cluster land in the same corners the floating
             chrome occupies. */
          showFitControl={false}
          showZoomControl={false}
        />

        <MapOverlay>
          <MapToolbar>
            <PlaceSearch
              className="glass pointer-events-auto min-w-0 sm:max-w-sm sm:flex-1"
              inputClassName="h-11 border-0 bg-transparent shadow-none focus-visible:ring-0"
              placeholder="Search for a place to explore…"
              onSelect={(result) => {
                const at = { lat: result.lat, lon: result.lon };
                setCenter(at);
                nonceRef.current += 1;
                setFlyTo({ ...at, nonce: nonceRef.current });
                void search(at, radiusM, loopKm);
              }}
            />

            <MapRail>
              <MapRailButton
                label="Center the map on my location"
                onClick={locate}
                disabled={locating || searching}
              >
                {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
              </MapRailButton>

              <MapRailButton
                label="Search this area"
                onClick={() => void search(center, radiusM, loopKm)}
                disabled={searching}
                active
              >
                {searching ? <Loader2 className="animate-spin" /> : <Search />}
              </MapRailButton>

              <MapRailButton
                label="Fit the route to the view"
                onClick={fitRoute}
                disabled={points.length < 2}
              >
                <Maximize2 />
              </MapRailButton>

              <MapRailButton
                label={panelOpen ? "Hide the route list" : "Show the route list"}
                pressed={panelOpen}
                onClick={() => setPanelOpen((open) => !open)}
              >
                {panelOpen ? <ChevronDown /> : <ChevronUp />}
              </MapRailButton>
            </MapRail>
          </MapToolbar>

          {panelOpen && (
            <MapPanel>
              <MapCard>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h1 className="text-xl font-extrabold tracking-tight">Explore</h1>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Signposted cycle routes near you, plus loops built to the length you want.
                    </p>
                  </div>
                  <Button
                    asChild
                    variant="ghost"
                    size="icon"
                    className="-mr-1 -mt-1 shrink-0"
                    aria-label="My rides"
                    title="My rides"
                  >
                    <Link to="/rides">
                      <RouteIcon className="size-4" />
                    </Link>
                  </Button>
                </div>

                <div className="mt-3 grid gap-4 border-t border-border pt-3">
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
              </MapCard>

              {searching &&
                [0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-20 shrink-0 rounded-2xl" />
                ))}

              {!searching && routes.length === 0 && (
                <MapCard className="text-center text-sm text-muted-foreground">
                  {searchedOnce
                    ? "No routes here yet — widen the radius, or pan the map and search this area."
                    : "Finding routes around you…"}
                </MapCard>
              )}

              {!searching &&
                routes.map((route) => {
                  const active = route.id === selectedId;
                  return (
                    <MapCard
                      key={route.id}
                      className={cn(
                        "min-w-0 transition-colors",
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
                          <span className="mt-1 block metric text-xs text-muted-foreground">
                            {formatDistance(route.distanceM)}
                            {route.ascentM > 0
                              ? ` · ${formatElevation(route.ascentM)} up`
                              : ""} · {route.subtitle}
                          </span>
                        </span>
                      </button>
                      {active && (
                        <div className="mt-3 space-y-3">
                          {route.ascentM > 0 && <ElevationChart points={points} height={90} />}
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
                    </MapCard>
                  );
                })}

              <MapCard className="p-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Route data © OpenStreetMap contributors. Generated loops follow bike-friendly
                  roads and paths; check them before you ride.
                </p>
              </MapCard>
            </MapPanel>
          )}
        </MapOverlay>
      </MapStage>
    </MapScreen>
  );
}
