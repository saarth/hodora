import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Crosshair,
  Flag,
  Loader2,
  Maximize2,
  Pause,
  Play,
  Route as RouteIcon,
  Save,
  TriangleAlert,
  Trash2,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildParsedRide,
  formatDistance,
  formatDuration,
  formatElevation,
  formatSpeed,
  haversine,
  type RawTrackPoint,
  type RidePoint,
} from "@/lib/gpx";
import { geolocationOptions, getLowPowerMode } from "@/lib/low-power";
import { acceptRecordingFix } from "@/lib/record";
import { createRide, fetchProfile, ridesKeys } from "@/lib/rides";
import { cn } from "@/lib/utils";
import { useWakeLock } from "@/hooks/use-wake-lock";

export const Route = createFileRoute("/record")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Record a ride — Hodora" },
      {
        name: "description",
        content:
          "Record your ride live with GPS — distance, time, elevation and speed, saved as a new route when you finish.",
      },
      { property: "og:title", content: "Record a ride — Hodora" },
      { property: "og:description", content: "Record your ride live with GPS." },
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: RecordPage,
});

type Status = "idle" | "recording" | "paused" | "stopped";

type LiveFix = { lat: number; lon: number; heading: number | null; speed: number | null };

function RecordPage() {
  const navigate = useNavigate();
  const { data: profile } = useQuery({ queryKey: ridesKeys.profile, queryFn: fetchProfile });
  const metric = profile?.unit !== "imperial";

  const [status, setStatus] = useState<Status>("idle");
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [rawPoints, setRawPoints] = useState<RawTrackPoint[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [name, setName] = useState("");
  const [lowPower] = useState(() => getLowPowerMode());
  const [panelOpen, setPanelOpen] = useState(true);
  const [follow, setFollow] = useState(true);
  // Bumped to re-frame the camera around the whole recorded track; the map
  // only reacts to a new `nonce`, so re-fitting the same coords still works.
  const [fitTo, setFitTo] = useState<{
    coords: { lat: number; lon: number }[];
    nonce: number;
  } | null>(null);

  const watchRef = useRef<number | null>(null);
  const startMsRef = useRef<number | null>(null);
  const pausedAccumMsRef = useRef(0);
  const pauseStartedAtRef = useRef<number | null>(null);
  // Read inside the geolocation callback instead of taken as an effect
  // dependency, so pausing/resuming doesn't tear down and reacquire the GPS
  // watch — only starting/stopping the recording does that.
  const statusRef = useRef<Status>("idle");
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useWakeLock(status === "recording" || status === "paused");

  const isTracking = status === "recording" || status === "paused";
  useEffect(() => {
    if (!isTracking) return;
    if (!("geolocation" in navigator)) {
      // Reports that an external API (geolocation) is unavailable — not
      // deriving state from props/state, so there's no callback to move it into.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGeoError("This device doesn't support location.");
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGeoError(null);
        setFix({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          heading: Number.isFinite(position.coords.heading ?? NaN) ? position.coords.heading : null,
          speed: Number.isFinite(position.coords.speed ?? NaN) ? position.coords.speed : null,
        });
        if (statusRef.current !== "recording") return;
        const nowMs = Date.now();
        const tSec = (nowMs - (startMsRef.current ?? nowMs) - pausedAccumMsRef.current) / 1000;
        setElapsedSec(tSec);
        setRawPoints((prev) =>
          acceptRecordingFix(prev, {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
            ele: Number.isFinite(position.coords.altitude ?? NaN) ? position.coords.altitude : null,
            tSec,
          }),
        );
      },
      (error) => setGeoError(error.message || "Location unavailable."),
      geolocationOptions(lowPower),
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [isTracking, lowPower]);

  const live = useMemo(() => {
    let distanceM = 0;
    let ascentM = 0;
    const points: RidePoint[] = [];
    for (let i = 0; i < rawPoints.length; i++) {
      const p = rawPoints[i];
      if (i > 0) {
        const prev = rawPoints[i - 1];
        distanceM += haversine(prev.lat, prev.lon, p.lat, p.lon);
        const deltaEle = p.ele - prev.ele;
        if (deltaEle > 0.5) ascentM += deltaEle;
      }
      points.push({ lat: p.lat, lon: p.lon, ele: p.ele, d: distanceM, t: p.t });
    }
    return { points, distanceM, ascentM };
  }, [rawPoints]);

  const avgSpeedMps = elapsedSec > 10 ? live.distanceM / elapsedSec : null;
  const currentSpeedMps = fix?.speed ?? null;

  function start() {
    startMsRef.current = Date.now();
    pausedAccumMsRef.current = 0;
    pauseStartedAtRef.current = null;
    setRawPoints([]);
    setElapsedSec(0);
    setStatus("recording");
  }

  function pause() {
    pauseStartedAtRef.current = Date.now();
    setStatus("paused");
  }

  function resume() {
    if (pauseStartedAtRef.current !== null) {
      pausedAccumMsRef.current += Date.now() - pauseStartedAtRef.current;
      pauseStartedAtRef.current = null;
    }
    setStatus("recording");
  }

  function discard() {
    setRawPoints([]);
    setElapsedSec(0);
    setName("");
    setStatus("idle");
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = buildParsedRide(
        rawPoints,
        name.trim() || `Ride — ${new Date().toLocaleDateString()}`,
      );
      return createRide({
        name: parsed.name,
        sourceFilename: null,
        distanceM: parsed.distanceM,
        ascentM: parsed.ascentM,
        descentM: parsed.descentM,
        bounds: parsed.bounds,
        points: parsed.points,
        isRecorded: true,
      });
    },
    onSuccess: (id) => {
      toast.success("Ride saved");
      navigate({ to: "/rides/$id", params: { id } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not save this ride"),
  });

  const recording = status === "recording";
  const tracking = recording || status === "paused";

  const fitTrack = () => {
    if (live.points.length < 2) return;
    setFollow(false);
    setFitTo({
      coords: live.points.map((point) => ({ lat: point.lat, lon: point.lon })),
      nonce: Date.now(),
    });
  };

  return (
    <MapScreen>
      <AppHeader />

      <MapStage>
        <RouteMap
          points={live.points}
          live={fix}
          follow={tracking && follow}
          initialCenter={fix}
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
            {/* Recording state has to be readable from a handlebar mount, so it
                gets its own chip rather than living only in the button row. */}
            <div className="glass pointer-events-auto flex items-center gap-2 self-start rounded-full px-3.5 py-2 text-xs font-semibold uppercase tracking-widest">
              <Circle
                className={cn(
                  "size-3",
                  recording
                    ? "animate-pulse fill-destructive text-destructive"
                    : tracking
                      ? "fill-warning text-warning"
                      : "fill-muted-foreground text-muted-foreground",
                )}
              />
              {recording
                ? "Recording"
                : status === "paused"
                  ? "Paused"
                  : status === "stopped"
                    ? "Finished"
                    : "Ready"}
              {tracking && (
                <span className="metric normal-case tracking-normal">
                  {formatDuration(elapsedSec)}
                </span>
              )}
            </div>

            <MapRail>
              <MapRailButton
                active={follow}
                pressed={follow}
                label={follow ? "Stop following my position" : "Recenter on my position"}
                onClick={() => setFollow((value) => !value)}
              >
                <Crosshair />
              </MapRailButton>

              <MapRailButton
                label="Fit the recorded track to the view"
                onClick={fitTrack}
                disabled={live.points.length < 2}
              >
                <Maximize2 />
              </MapRailButton>

              <MapRailButton
                label={panelOpen ? "Hide ride stats" : "Show ride stats"}
                pressed={panelOpen}
                onClick={() => setPanelOpen((open) => !open)}
              >
                {panelOpen ? <ChevronDown /> : <ChevronUp />}
              </MapRailButton>
            </MapRail>
          </MapToolbar>

          {geoError && (
            <MapCard className="glass-faint flex items-center gap-2 p-2.5 text-xs text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" />
              {geoError} — allow location access to record a ride.
            </MapCard>
          )}

          {panelOpen && (
            <MapPanel>
              <MapCard>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h1 className="text-xl font-extrabold tracking-tight">Record a ride</h1>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Track your ride live with GPS, then save it as a new route.
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

                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 min-[420px]:grid-cols-3 sm:grid-cols-2">
                  <Stat label="Elapsed" value={formatDuration(elapsedSec)} />
                  <Stat label="Distance" value={formatDistance(live.distanceM, metric)} />
                  <Stat
                    label="Current speed"
                    value={
                      currentSpeedMps != null
                        ? `${formatSpeed(currentSpeedMps, metric)} ${metric ? "km/h" : "mph"}`
                        : "—"
                    }
                  />
                  <Stat
                    label="Avg speed"
                    value={
                      avgSpeedMps != null
                        ? `${formatSpeed(avgSpeedMps, metric)} ${metric ? "km/h" : "mph"}`
                        : "—"
                    }
                  />
                  <Stat label="Elevation gain" value={formatElevation(live.ascentM, metric)} />
                </div>
              </MapCard>

              {status === "idle" && (
                <Button
                  size="lg"
                  className="glow-ring pointer-events-auto shrink-0"
                  onClick={start}
                >
                  <Circle className="size-4 fill-current" />
                  Start recording
                </Button>
              )}

              {tracking && (
                <div className="pointer-events-auto flex shrink-0 gap-2">
                  {recording ? (
                    <Button size="lg" variant="secondary" className="glass flex-1" onClick={pause}>
                      <Pause className="size-4" />
                      Pause
                    </Button>
                  ) : (
                    <Button size="lg" className="flex-1" onClick={resume}>
                      <Play className="size-4" />
                      Resume
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="destructive"
                    className="flex-1"
                    onClick={() => setStatus("stopped")}
                    disabled={rawPoints.length < 2}
                  >
                    <Flag className="size-4" />
                    Finish
                  </Button>
                </div>
              )}

              {status === "stopped" && (
                <MapCard className="grid gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Ride name
                    </span>
                    <Input
                      className="mt-2"
                      placeholder={`Ride — ${new Date().toLocaleDateString()}`}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      autoFocus
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={discard}>
                      <Trash2 className="size-4" />
                      Discard
                    </Button>
                    <Button
                      className="glow-ring flex-1"
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending || rawPoints.length < 2}
                    >
                      {saveMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Save ride
                    </Button>
                  </div>
                </MapCard>
              )}

              {live.points.length > 1 && (
                <MapCard>
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Elevation
                  </h2>
                  <div className="mt-3">
                    <ElevationChart points={live.points} metric={metric} height={110} />
                  </div>
                </MapCard>
              )}
            </MapPanel>
          )}
        </MapOverlay>
      </MapStage>
    </MapScreen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 truncate metric text-lg font-bold">{value}</p>
    </div>
  );
}
