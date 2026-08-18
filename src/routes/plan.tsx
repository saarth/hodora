import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Crosshair, Loader2, MapPin, Redo2, Route as RouteIcon, Save, Undo2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RouteMap } from "@/components/RouteMap";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { boundsOf, toRidePoints } from "@/lib/discover";
import { formatDistance } from "@/lib/gpx";
import { createRide, fetchRide, ridesKeys, updateRide } from "@/lib/rides";
import {
  BIKE_PROFILES,
  fetchRoute,
  type BikeProfile,
  type LatLon,
  type RoutedPath,
} from "@/lib/routing";

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
      { property: "og:url", content: "https://hodora.app/plan" },
    ],
    links: [{ rel: "canonical", href: "https://hodora.app/plan" }],
  }),
  component: PlanPage,
});

const FALLBACK_CENTER: LatLon = { lat: 47.3769, lon: 8.5417 };

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!routed || routed.path.length < 2) throw new Error("Add at least two points first");
      const input = {
        name: name.trim() || "Planned route",
        distanceM: routed.distanceM,
        ascentM: 0,
        descentM: 0,
        bounds: boundsOf(routed.path),
        points: toRidePoints(routed.path),
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {activeEditRide ? `Edit ${activeEditRide.name}` : "Plan a route"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeEditRide
                ? "Move, add or remove points, then save — notes and offline downloads on this route may need re-checking afterwards."
                : "Tap the map to add points — Hodora routes between them over real roads and paths."}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/rides">
              <RouteIcon className="size-4" />
              My rides
            </Link>
          </Button>
        </div>

        {editId && editLoading && (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading route to edit…
          </p>
        )}

        <div className="surface mt-6 grid gap-5 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={locate}
              disabled={locating}
              title="Center the map on your location"
            >
              {locating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Crosshair className="size-4" />
              )}
              My location
            </Button>
            <Button
              variant="outline"
              onClick={() => setWaypoints((current) => current.slice(0, -1))}
              disabled={waypoints.length === 0}
            >
              <Undo2 className="size-4" />
              Undo point
            </Button>
            <Button
              variant="outline"
              onClick={() => setWaypoints([])}
              disabled={waypoints.length === 0}
            >
              <Redo2 className="size-4" />
              Clear
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="surface h-[380px] overflow-hidden p-0 lg:h-[520px]">
            <RouteMap
              points={points}
              waypoints={waypoints}
              onMapClick={(point) => setWaypoints((current) => [...current, point])}
              initialCenter={center}
              flyTo={flyTo}
              showFitControl={points.length > 1}
              className="h-full w-full"
            />
          </div>

          <section className="grid gap-4 content-start">
            <div className="surface p-4">
              {waypoints.length === 0 ? (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  Tap the map to drop your first point.
                </p>
              ) : (
                <>
                  <p className="font-mono text-sm">
                    {waypoints.length} point{waypoints.length === 1 ? "" : "s"}
                    {routed ? (
                      <>
                        {" "}
                        · {formatDistance(routed.distanceM)}
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

            {points.length > 1 && (
              <div className="surface grid gap-3 p-4">
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
              </div>
            )}
          </section>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Routes are computed with OpenStreetMap data via BRouter/OSRM. Route data © OpenStreetMap
          contributors — check unfamiliar roads before you ride.
        </p>
      </main>
    </div>
  );
}
