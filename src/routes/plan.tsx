import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Loader2,
  MapPin,
  Maximize2,
  Move,
  Repeat2,
  Route as RouteIcon,
  Save,
  Search,
  TrainFront,
  Trash2,
  Undo2,
  X,
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
import { DayTabs } from "@/components/DayTabs";
import { HourPicker } from "@/components/HourPicker";
import { WeatherGlyph } from "@/components/WeatherGlyph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { boundsOf, toRidePoints } from "@/lib/discover";
import { computeAscentDescent, formatDistance, formatElevation } from "@/lib/gpx";
import { compassAbbrev } from "@/lib/nav";
import {
  boundsAround,
  boundsContain,
  fetchPois,
  poiCategoryLabel,
  POI_CATEGORIES,
  POI_COLOR_VAR,
  type Bounds,
  type Poi,
  type PoiCategory,
} from "@/lib/poi";
import { createRide, fetchRide, ridesKeys, updateRide } from "@/lib/rides";
import { absoluteUrl, canonicalLink } from "@/lib/seo";
import { cn } from "@/lib/utils";
import {
  BIKE_PROFILES,
  fetchRoute,
  type BikeProfile,
  type LatLon,
  type RoutedPath,
} from "@/lib/routing";
import {
  closestHourIndex,
  fetchHourlyWind,
  formatTemperature,
  formatWindSpeed,
  groupForecastByDay,
  isDaytimeHour,
  weatherInfo,
} from "@/lib/weather";

const TITLE = "Bike Route Planner — Plan Cycle Routes on the Map | Hodora";
const DESCRIPTION =
  "Free bike route planner. Tap the map to plan a cycle route, routed over real roads and paths with OpenStreetMap data, then save it for turn-by-turn navigation.";

const searchSchema = z.object({
  /** id of an existing planned route to reopen and re-save, instead of creating a new one */
  edit: z.string().optional(),
});

export const Route = createFileRoute("/plan")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: absoluteUrl("/plan") },
    ],
    links: canonicalLink("/plan"),
  }),
  component: PlanPage,
});

const FALLBACK_CENTER: LatLon = { lat: 47.3769, lon: 8.5417 };

/** What a point is called in the point list — the ends are named, the rest are numbered by their position along the route. */
function pointLabel(index: number, total: number): string {
  if (index === 0) return "Start";
  if (index === total - 1) return "Finish";
  return `Via ${index}`;
}

function PlanPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { edit: editId } = Route.useSearch();
  const [center, setCenter] = useState<LatLon>(FALLBACK_CENTER);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; nonce: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [waypoints, setWaypoints] = useState<LatLon[]>([]);
  const [profile, setProfile] = useState<BikeProfile>("trekking");
  const [routed, setRouted] = useState<RoutedPath | null>(null);
  const [routing, setRouting] = useState(false);
  const [name, setName] = useState("");
  const [panelOpen, setPanelOpen] = useState(true);
  // Bumped to re-frame the camera around the whole route; the map only reacts
  // to a new `nonce`, so re-fitting the same coords still works.
  const [fitTo, setFitTo] = useState<{
    coords: { lat: number; lon: number }[];
    nonce: number;
  } | null>(null);
  // The point the rider is editing in the point list: highlighted on the map,
  // and the one the move/remove/reorder buttons act on.
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  // Set while "Move" is armed — the next tap on the map (or on a place pin)
  // relocates this point instead of adding a new one to the end.
  const [movingPoint, setMovingPoint] = useState<number | null>(null);

  // Nearby places (train stations, cafes, water, bike shops, toilets).
  const [showPois, setShowPois] = useState(false);
  const [poiCategories, setPoiCategories] = useState<PoiCategory[]>(["train_station"]);
  // The area POIs were last fetched for. Deliberately *not* the live map view:
  // Overpass is a free public service, so it's queried when the rider asks
  // (turning the layer on, or "Search this area") rather than on every pan.
  const [poiArea, setPoiArea] = useState<Bounds | null>(null);
  const [view, setView] = useState<{ center: LatLon; radiusM: number } | null>(null);

  const {
    data: editRide,
    isLoading: editLoading,
    error: editError,
  } = useQuery({
    queryKey: ridesKeys.detail(editId ?? ""),
    queryFn: () => fetchRide(editId!),
    enabled: Boolean(editId),
    retry: false,
  });

  useEffect(() => {
    if (editError) toast.error("Could not load that route to edit.");
  }, [editError]);

  // Seeds the planner from the route being edited, once — a background
  // refetch of the same query must not stomp on waypoints the rider is
  // actively dragging around.
  const [seededEditId, setSeededEditId] = useState<string | null>(null);
  useEffect(() => {
    if (!editRide || seededEditId === editRide.id) return;
    if (!editRide.plan_waypoints || editRide.plan_waypoints.length < 2) {
      toast.error("This route wasn't created in the planner, so it can't be edited here.");
      // Marks this ride as "handled" so the toast above doesn't refire on
      // every render — not a value derived from props/state, so there's no
      // callback to move this into.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeededEditId(editRide.id);
      return;
    }
    // Reflects the loaded ride into local editor state — not a value
    // derived from props/state, so there's no callback to move it into.

    setWaypoints(editRide.plan_waypoints);
    setProfile(editRide.plan_profile ?? "trekking");
    setName(editRide.name);
    setSeededEditId(editRide.id);
  }, [editRide, seededEditId]);

  // The ride actually being edited — null (not just "not loaded yet") when
  // `editRide` exists but has no usable planner waypoints, so the rest of
  // the page falls back to the normal "plan a new route" behavior instead
  // of half-showing an edit state for a route that can't be edited here.
  const activeEditRide =
    editRide && editRide.plan_waypoints && editRide.plan_waypoints.length >= 2 ? editRide : null;

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const at = { lat: position.coords.latitude, lon: position.coords.longitude };
        setLocating(false);
        setCenter(at);
        setFlyTo({ ...at, nonce: Date.now() });
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    // Kicks off geolocation on mount (locate() sets the loading flag
    // synchronously before its async callback resolves) — not a value
    // derived from props/state, so there's no callback to move it into.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-route through every waypoint whenever the points or the chosen profile change.
  useEffect(() => {
    if (waypoints.length < 2) {
      // Clears any previous route once there are too few waypoints to route
      // between — not a value derived from props/state, so there's no
      // callback to move this into.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRouted(null);
      return;
    }
    const controller = new AbortController();
    setRouting(true);
    fetchRoute(waypoints, { profile, preferBrouter: true, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setRouted(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setRouting(false);
      });
    return () => controller.abort();
  }, [waypoints, profile]);

  const points = useMemo(
    () => (routed && routed.path.length > 1 ? toRidePoints(routed.path) : []),
    [routed],
  );
  const elevation = useMemo(() => computeAscentDescent(points), [points]);

  const routeStart = points[0];
  const { data: hourly } = useQuery({
    queryKey: ["plan-weather-forecast", routeStart?.lat, routeStart?.lon],
    queryFn: () => fetchHourlyWind(routeStart!.lat, routeStart!.lon),
    enabled: Boolean(routeStart),
    staleTime: 10 * 60 * 1000,
  });
  const forecastDays = useMemo(() => groupForecastByDay(hourly ?? []), [hourly]);
  const [departureDayKey, setDepartureDayKey] = useState<string | null>(null);
  const [departureHourIso, setDepartureHourIso] = useState<string | null>(null);
  const departureDay =
    forecastDays.find((day) => day.dateKey === departureDayKey) ?? forecastDays[0] ?? null;
  const departureHour =
    departureDay?.hours.find((hour) => hour.atIso === departureHourIso) ??
    (departureDay ? departureDay.hours[closestHourIndex(departureDay.hours)] : null);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!routed || routed.path.length < 2) throw new Error("Add at least two points first");
      const ridePoints = toRidePoints(routed.path);
      const { ascentM, descentM } = computeAscentDescent(ridePoints);
      const input = {
        name: name.trim() || "Planned route",
        distanceM: routed.distanceM,
        ascentM,
        descentM,
        bounds: boundsOf(routed.path),
        points: ridePoints,
        cues: routed.cues,
        planWaypoints: waypoints,
        planProfile: profile,
      };
      if (activeEditRide) {
        await updateRide(activeEditRide.id, input);
        return activeEditRide.id;
      }
      return createRide({ ...input, sourceFilename: null });
    },
    onSuccess: (id) => {
      toast.success(activeEditRide ? "Route updated" : "Saved to your rides");
      queryClient.invalidateQueries({ queryKey: ridesKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: ridesKeys.all });
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

  /**
   * Every way of picking a spot on the map ends up here — a tap on empty map
   * and a tap on a place pin alike. With "Move" armed it relocates that point
   * in place, keeping its position in the route; otherwise it appends.
   */
  const addOrMovePoint = (point: LatLon) => {
    if (movingPoint !== null) {
      const index = movingPoint;
      setWaypoints((current) => current.map((waypoint, at) => (at === index ? point : waypoint)));
      setMovingPoint(null);
      setSelectedPoint(index);
      return;
    }
    // No auto-select on a plain add: tapping out a route is a run of taps, and
    // opening a row's edit buttons under each one just shifts the list around.
    setWaypoints((current) => [...current, point]);
  };

  const removePoint = (index: number) => {
    setWaypoints((current) => current.filter((_, at) => at !== index));
    setSelectedPoint(null);
    setMovingPoint(null);
  };

  /** Swaps a point with its neighbour, which is what reordering a route means: the ride's shape changes, not just the list. */
  const shiftPoint = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= waypoints.length) return;
    const next = [...waypoints];
    [next[index], next[target]] = [next[target], next[index]];
    setWaypoints(next);
    setSelectedPoint(target);
    setMovingPoint(null);
  };

  const reversePoints = () => {
    if (waypoints.length < 2) return;
    setWaypoints([...waypoints].reverse());
    setSelectedPoint(selectedPoint === null ? null : waypoints.length - 1 - selectedPoint);
    setMovingPoint(null);
  };

  const clearPoints = () => {
    setWaypoints([]);
    setSelectedPoint(null);
    setMovingPoint(null);
  };

  const undoPoint = () => {
    setWaypoints((current) => current.slice(0, -1));
    setSelectedPoint(null);
    setMovingPoint(null);
  };

  /** The box POIs get fetched for: whatever the map is showing, falling back to a city-sized box around the camera before the first pan reports a view. */
  const visibleArea = () => boundsAround(view?.center ?? center, view?.radiusM ?? 6000);

  const togglePois = () => {
    if (showPois) {
      setShowPois(false);
      return;
    }
    setPoiArea(visibleArea());
    setShowPois(true);
  };

  const {
    data: pois,
    isFetching: poisLoading,
    error: poisError,
  } = useQuery({
    queryKey: ["plan-pois", poiArea, [...poiCategories].sort()],
    queryFn: ({ signal }) => fetchPois(poiArea!, poiCategories, signal),
    enabled: showPois && Boolean(poiArea) && poiCategories.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  // Panning off the fetched box is what makes the results stale — so that, and
  // not every small nudge of the map, is what offers a re-search.
  const poiAreaStale = Boolean(showPois && poiArea && view && !boundsContain(poiArea, view.center));

  const togglePoiCategory = (category: PoiCategory) =>
    setPoiCategories((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : [...current, category],
    );

  const addPoiAsPoint = (poi: Poi) => {
    addOrMovePoint({ lat: poi.lat, lon: poi.lon });
    toast.success(
      movingPoint !== null
        ? `Point moved to ${poi.name ?? poiCategoryLabel(poi.category)}`
        : `Added ${poi.name ?? poiCategoryLabel(poi.category)}`,
    );
  };

  return (
    <MapScreen>
      <AppHeader />

      <MapStage>
        <RouteMap
          points={points}
          waypoints={waypoints}
          activeWaypoint={movingPoint ?? selectedPoint}
          onMapClick={addOrMovePoint}
          pois={showPois ? (pois ?? []) : null}
          onPoiClick={addPoiAsPoint}
          onViewChange={setView}
          initialCenter={center}
          flyTo={flyTo}
          fitTo={fitTo}
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
              placeholder="Search for a place to start planning…"
              onSelect={(result) => {
                const at = { lat: result.lat, lon: result.lon };
                setCenter(at);
                setFlyTo({ ...at, nonce: Date.now() });
              }}
            />

            <MapRail>
              <MapRailButton
                label="Center the map on my location"
                onClick={locate}
                disabled={locating}
              >
                {locating ? <Loader2 className="animate-spin" /> : <Crosshair />}
              </MapRailButton>

              <MapRailButton
                label="Fit the route to the view"
                onClick={fitRoute}
                disabled={points.length < 2}
              >
                <Maximize2 />
              </MapRailButton>

              <MapRailButton
                label="Undo the last point"
                onClick={undoPoint}
                disabled={waypoints.length === 0}
              >
                <Undo2 />
              </MapRailButton>

              <MapRailButton
                label="Clear all points"
                onClick={clearPoints}
                disabled={waypoints.length === 0}
              >
                <Trash2 />
              </MapRailButton>

              <MapRailButton
                label={showPois ? "Hide nearby places" : "Show nearby places"}
                active={showPois}
                pressed={showPois}
                onClick={togglePois}
              >
                {poisLoading ? <Loader2 className="animate-spin" /> : <TrainFront />}
              </MapRailButton>

              <MapRailButton
                label={panelOpen ? "Hide route details" : "Show route details"}
                pressed={panelOpen}
                onClick={() => setPanelOpen((open) => !open)}
              >
                {panelOpen ? <ChevronDown /> : <ChevronUp />}
              </MapRailButton>
            </MapRail>
          </MapToolbar>

          {editId && editLoading && (
            <MapCard className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading route to edit…
            </MapCard>
          )}

          {panelOpen && (
            <MapPanel>
              <MapCard>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-extrabold tracking-tight">
                      {activeEditRide ? `Edit ${activeEditRide.name}` : "Plan a route"}
                    </h1>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {activeEditRide
                        ? "Move, add or remove points, then save — notes and offline downloads on this route may need re-checking afterwards."
                        : "Tap the map to add points — Hodora routes between them over real roads and paths."}
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

                <div className="mt-3 border-t border-border pt-3">
                  {waypoints.length === 0 ? (
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 size-4 shrink-0" />
                      Tap the map to drop your first point.
                    </p>
                  ) : (
                    <>
                      <p className="metric text-sm">
                        {waypoints.length} point{waypoints.length === 1 ? "" : "s"}
                        {routed ? (
                          <>
                            {" "}
                            · {formatDistance(routed.distanceM)}
                            {elevation.ascentM > 0
                              ? ` · ${formatElevation(elevation.ascentM)} up`
                              : ""}
                            {routing && <Loader2 className="ml-2 inline size-3.5 animate-spin" />}
                          </>
                        ) : null}
                      </p>
                      {routed && !routed.routed && (
                        <p className="mt-1 text-xs text-warning">
                          Routers unreachable — showing a straight-line estimate.
                        </p>
                      )}
                      {waypoints.length === 1 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Add one more point to generate a route.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </MapCard>

              {waypoints.length > 0 && (
                <MapCard>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Points
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-mr-2 h-7 px-2 text-xs"
                      onClick={reversePoints}
                      disabled={waypoints.length < 2}
                    >
                      <Repeat2 className="size-3.5" />
                      Reverse
                    </Button>
                  </div>

                  <ol className="mt-2 max-h-56 space-y-1 overflow-y-auto overscroll-contain">
                    {waypoints.map((waypoint, index) => {
                      const selected = selectedPoint === index;
                      const moving = movingPoint === index;
                      return (
                        // Index keys are the honest ones here: a point *is* its
                        // position in the route, and reordering is meant to
                        // re-render both rows it swapped.
                        <li key={index}>
                          <button
                            type="button"
                            aria-expanded={selected}
                            onClick={() => {
                              setSelectedPoint(selected ? null : index);
                              setMovingPoint(null);
                              setFlyTo({ lat: waypoint.lat, lon: waypoint.lon, nonce: Date.now() });
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary",
                              selected && "bg-secondary",
                            )}
                          >
                            <span className="metric flex size-6 shrink-0 items-center justify-center rounded-full bg-elevated text-[11px] font-bold">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {pointLabel(index, waypoints.length)}
                              </span>
                              <span className="metric block truncate text-[11px] text-muted-foreground">
                                {waypoint.lat.toFixed(4)}, {waypoint.lon.toFixed(4)}
                              </span>
                            </span>
                          </button>

                          {selected && (
                            <div className="mb-1 mt-1 flex flex-wrap items-center gap-1 pl-8">
                              <Button
                                size="sm"
                                variant={moving ? "default" : "secondary"}
                                className="h-7 px-2 text-xs"
                                onClick={() => setMovingPoint(moving ? null : index)}
                              >
                                {moving ? (
                                  <X className="size-3.5" />
                                ) : (
                                  <Move className="size-3.5" />
                                )}
                                {moving ? "Cancel move" : "Move"}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 w-8 px-0"
                                aria-label={`Move ${pointLabel(index, waypoints.length)} earlier in the route`}
                                title="Earlier in the route"
                                disabled={index === 0}
                                onClick={() => shiftPoint(index, -1)}
                              >
                                <ArrowUp className="size-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 w-8 px-0"
                                aria-label={`Move ${pointLabel(index, waypoints.length)} later in the route`}
                                title="Later in the route"
                                disabled={index === waypoints.length - 1}
                                onClick={() => shiftPoint(index, 1)}
                              >
                                <ArrowDown className="size-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                onClick={() => removePoint(index)}
                              >
                                <Trash2 className="size-3.5" />
                                Remove
                              </Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {movingPoint !== null
                      ? `Tap the map to move ${pointLabel(movingPoint, waypoints.length)}.`
                      : "Tap a point to move, reorder or remove it. New taps on the map are added at the end."}
                  </p>
                </MapCard>
              )}

              {showPois && (
                <MapCard>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Nearby places
                    </span>
                    {poisLoading && (
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {POI_CATEGORIES.map((category) => {
                      const on = poiCategories.includes(category.value);
                      return (
                        <button
                          key={category.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() => togglePoiCategory(category.value)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                            on
                              ? "border-transparent bg-secondary text-secondary-foreground"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          <span
                            className="size-2 rounded-full"
                            style={{
                              background: `var(${POI_COLOR_VAR[category.value]})`,
                              opacity: on ? 1 : 0.35,
                            }}
                            aria-hidden
                          />
                          {category.label}
                        </button>
                      );
                    })}
                  </div>

                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {poiCategories.length === 0
                      ? "Pick a category to see places on the map."
                      : "Tap a place on the map to add it to your route — handy for starting or finishing at a station."}
                  </p>

                  {poiAreaStale && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-2 w-full"
                      onClick={() => setPoiArea(visibleArea())}
                    >
                      <Search className="size-3.5" />
                      Search this area
                    </Button>
                  )}

                  {poisError ? (
                    <p className="mt-2 text-[11px] text-warning">
                      Couldn&apos;t reach OpenStreetMap for places here.
                    </p>
                  ) : (
                    poiCategories.length > 0 &&
                    !poisLoading &&
                    pois?.length === 0 && (
                      <p className="mt-2 text-[11px] text-warning">
                        Nothing found in this area — try another spot or a wider view.
                      </p>
                    )
                  )}
                </MapCard>
              )}

              <MapCard>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Routing style
                  </span>
                  <ToggleGroup
                    type="single"
                    value={profile}
                    onValueChange={(value) => value && setProfile(value as BikeProfile)}
                    className="mt-3 justify-start"
                  >
                    {BIKE_PROFILES.map((option) => (
                      <ToggleGroupItem
                        key={option.value}
                        value={option.value}
                        title={option.description}
                        className="px-3"
                      >
                        {option.label}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </label>
              </MapCard>

              {elevation.ascentM > 0 && (
                <MapCard>
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Elevation
                  </span>
                  <div className="mt-3">
                    <ElevationChart points={points} height={110} />
                  </div>
                </MapCard>
              )}

              {departureHour && departureDay && (
                <MapCard>
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Weather at departure
                  </span>
                  <div className="mt-3 flex items-center gap-3">
                    <WeatherGlyph
                      icon={
                        weatherInfo(departureHour.weatherCode, isDaytimeHour(departureHour.atIso))
                          .icon
                      }
                      className="size-8 text-primary"
                    />
                    <div className="min-w-0">
                      <p className="metric text-lg font-bold leading-none">
                        {formatTemperature(departureHour.temperatureC, true)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {
                          weatherInfo(departureHour.weatherCode, isDaytimeHour(departureHour.atIso))
                            .label
                        }{" "}
                        · {formatWindSpeed(departureHour.windSpeedMs, true)}{" "}
                        {compassAbbrev(departureHour.windDirectionDeg)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <DayTabs
                      days={forecastDays}
                      value={departureDay.dateKey}
                      onChange={(dateKey) => {
                        setDepartureDayKey(dateKey);
                        setDepartureHourIso(null);
                      }}
                    />
                    <HourPicker
                      hours={departureDay.hours}
                      value={departureHour.atIso}
                      onChange={setDepartureHourIso}
                    />
                  </div>
                </MapCard>
              )}

              {points.length > 1 && (
                <MapCard className="grid gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Route name
                    </span>
                    <Input
                      className="mt-2"
                      placeholder="Planned route"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <Button
                    className="glow-ring"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    {activeEditRide ? "Save changes" : "Save to my rides"}
                  </Button>
                </MapCard>
              )}

              <MapCard className="p-3">
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Routes are computed with OpenStreetMap data via BRouter/OSRM. Route data ©
                  OpenStreetMap contributors — check unfamiliar roads before you ride.
                </p>
              </MapCard>
            </MapPanel>
          )}
        </MapOverlay>
      </MapStage>
    </MapScreen>
  );
}
