import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Circle,
  Flag,
  Loader2,
  Pause,
  Play,
  Route as RouteIcon,
  Save,
  TriangleAlert,
  Trash2,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { RouteMap } from "@/components/RouteMap";
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Record a ride</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Track your ride live with GPS, then save it as a new route.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/rides">
              <RouteIcon className="size-4" />
              My rides
            </Link>
          </Button>
        </div>

        {geoError && (
          <div className="surface mt-6 flex items-center gap-2 border-destructive/30 p-3 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" />
            {geoError} — allow location access to record a ride.
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="surface h-[380px] overflow-hidden p-0 lg:h-[520px]">
            <RouteMap
              points={live.points}
              live={fix}
              follow={status === "recording" || status === "paused"}
              className="h-full w-full"
              showFitControl={live.points.length > 1}
            />
          </div>

          <section className="grid gap-4 content-start">
            <div className="surface p-4">
              <div className="grid grid-cols-2 gap-3">
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
            </div>

            {status === "idle" && (
              <Button size="lg" className="glow-ring" onClick={start}>
                <Circle className="size-4 fill-current" />
                Start recording
              </Button>
            )}

            {(status === "recording" || status === "paused") && (
              <div className="flex gap-2">
                {status === "recording" ? (
                  <Button size="lg" variant="secondary" className="flex-1" onClick={pause}>
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
              <div className="surface grid gap-3 p-4">
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
              </div>
            )}

            {live.points.length > 1 && (
              <div className="surface p-4">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Elevation
                </h2>
                <div className="mt-3">
                  <ElevationChart points={live.points} metric={metric} height={140} />
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-lg font-bold">{value}</p>
    </div>
  );
}
