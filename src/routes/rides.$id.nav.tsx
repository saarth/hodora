import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  CloudRain,
  Contrast,
  CornerDownLeft,
  CornerDownRight,
  Crosshair,
  Flag,
  Loader2,
  Box,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Navigation,
  StickyNote,
  TriangleAlert,
  Volume2,
  VolumeX,
  Wind,
} from "lucide-react";
import { toast } from "sonner";
import { RouteMap } from "@/components/RouteMap";
import { ElevationChart } from "@/components/ElevationChart";
import { SpeedHistoryChart, type SpeedSample } from "@/components/SpeedHistoryChart";
import { WeatherGlyph } from "@/components/WeatherGlyph";
import { Button } from "@/components/ui/button";
import { buildCueSheet, cueText, nearestCueName } from "@/lib/cues";
import { bearing, formatDistance, formatDuration, formatElevation, formatSpeed } from "@/lib/gpx";
import {
  compassAbbrev,
  compassLabel,
  detectTurns,
  findProximityAlert,
  nextTurn,
  remainingAscent,
  routeBearing,
  snapToRoute,
  upcomingGrade,
  windComponent,
  windEffect,
  windRelativeAngle,
  type Snap,
  type WindEffect,
} from "@/lib/nav";
import { geolocationOptions, getLowPowerMode, weatherPollOptions } from "@/lib/low-power";
import { useRejoinRoute } from "@/lib/rejoin";
import { fetchProfile, fetchRide, ridesKeys } from "@/lib/rides";
import {
  getVoicePreference,
  isVoiceSupported,
  nextTurnAnnouncement,
  setVoicePreference,
  speak,
  speakableDistance,
} from "@/lib/voice";
import {
  fetchHourlyWind,
  findRainAlert,
  formatTemperature,
  formatWindSpeed,
  useWeather,
  weatherInfo,
} from "@/lib/weather";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { useTheme } from "@/lib/theme";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rides/$id/nav")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Navigate — Hodora" },
      {
        name: "description",
        content:
          "Live turn-by-turn navigation along your GPX route with distance to go, next turn and off-route alerts.",
      },
      { property: "og:title", content: "Navigate — Hodora" },
      { property: "og:description", content: "Live turn-by-turn navigation along your GPX route." },
    ],
  }),
  component: NavigatePage,
});

const HC_STORAGE_KEY = "hodora-nav-hc";

type LiveFix = {
  lat: number;
  lon: number;
  heading: number | null;
  speed: number | null;
};

function NavigatePage() {
  const { id } = Route.useParams();
  const { data: profile } = useQuery({ queryKey: ridesKeys.profile, queryFn: fetchProfile });
  const metric = profile?.unit !== "imperial";
  const { data: ride, isLoading } = useQuery({
    queryKey: ridesKeys.detail(id),
    queryFn: () => fetchRide(id),
  });

  const [fix, setFix] = useState<LiveFix | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [angled, setAngled] = useState(false);
  const [bottomMinimized, setBottomMinimized] = useState(false);
  const [finished, setFinished] = useState(false);
  // Lazy initializer (not an effect): this route is client-only (ssr: false),
  // so localStorage is always available on first render here.
  const [highContrast, setHighContrast] = useState(
    () => window.localStorage.getItem(HC_STORAGE_KEY) === "1",
  );
  const [voiceEnabled, setVoiceEnabled] = useState(() => getVoicePreference());
  const [lowPower] = useState(() => getLowPowerMode());
  const [speedHistory, setSpeedHistory] = useState<SpeedSample[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [avgSpeedMps, setAvgSpeedMps] = useState<number | null>(null);
  const [etaLabel, setEtaLabel] = useState("—");
  const { theme } = useTheme();
  const [fitTo, setFitTo] = useState<{
    coords: { lat: number; lon: number }[];
    nonce: number;
  } | null>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
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
      },
      (error) => setGeoError(error.message || "Location unavailable."),
      geolocationOptions(lowPower),
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [lowPower]);

  const turns = useMemo(() => (ride ? detectTurns(ride.points) : []), [ride]);

  // Carries the previous fix's snapped index into the next search so it stays
  // windowed around the rider's actual progress instead of a fresh global
  // nearest-point search every fix. Without this, a route that crosses near
  // itself (a loop's start/finish, an out-and-back) can snap to the wrong
  // crossing — most visibly, a loop's finish snapping back to progress 0
  // because the start point is just as close as the true finish. This is the
  // standard "remember the previous render's derived value" ref idiom: the
  // ref is written after render (below) and only ever read here to seed the
  // *next* computation, so it never makes this render's output depend on
  // when it runs — eslint-plugin-react-hooks' newer `refs` rule flags any
  // ref read inside a memo regardless, so it's suppressed for this one line.
  const lastSnapIndexRef = useRef(0);
  useEffect(() => {
    lastSnapIndexRef.current = 0;
  }, [ride?.id]);

  const snap: Snap | null = useMemo(() => {
    if (!ride || !fix) return null;
    // eslint-disable-next-line react-hooks/refs -- see comment above
    return snapToRoute(ride.points, fix.lat, fix.lon, lastSnapIndexRef.current);
  }, [ride, fix]);

  useEffect(() => {
    if (snap) lastSnapIndexRef.current = snap.index;
  }, [snap]);

  const offRoute = snap ? snap.offRouteM > 40 : false;
  // Bike-friendly path back to the track, refreshed as the rider moves.
  const { route: rejoinRoute, loading: rejoinLoading } = useRejoinRoute(
    fix ? { lat: fix.lat, lon: fix.lon } : null,
    offRoute && snap ? { lat: snap.lat, lon: snap.lon } : null,
    offRoute,
  );

  const turn = useMemo(() => (snap ? nextTurn(turns, snap.progressM) : null), [snap, turns]);
  const turnDistanceM = turn && snap ? Math.max(0, turn.at - snap.progressM) : null;

  // Full cue sheet (falls back to detectTurns-derived turns when the ride
  // has no router-provided cues) — used to name the street in the maneuver
  // banner and the matching voice announcement, when the router provided one
  // close enough to this turn to plausibly be the same one.
  const cueSheet = useMemo(() => (ride ? buildCueSheet(ride.points, ride.cues) : []), [ride]);

  // Live position when we have a GPS fix, otherwise the route's start — so
  // conditions are visible even before location is granted or locked in.
  const weatherPosition = useMemo(() => {
    if (fix) return { lat: fix.lat, lon: fix.lon };
    const start = ride?.points[0];
    return start ? { lat: start.lat, lon: start.lon } : null;
  }, [fix, ride]);
  const { weather } = useWeather(weatherPosition, weatherPollOptions(lowPower));

  // Rounded to ~1km so GPS jitter doesn't churn the query key — matches
  // fetchHourlyWind's own internal cache granularity.
  const rainForecastKey = weatherPosition
    ? `${weatherPosition.lat.toFixed(2)},${weatherPosition.lon.toFixed(2)}`
    : null;
  const { data: hourlyRain } = useQuery({
    queryKey: ["nav-rain-forecast", rainForecastKey],
    queryFn: () => fetchHourlyWind(weatherPosition!.lat, weatherPosition!.lon, 1),
    enabled: Boolean(weatherPosition),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  const rainAlertedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    rainAlertedRef.current = new Set();
  }, [ride?.id]);

  useEffect(() => {
    if (finished || !hourlyRain) return;
    const alert = findRainAlert(hourlyRain, Date.now(), rainAlertedRef.current);
    if (!alert) return;
    rainAlertedRef.current = new Set(rainAlertedRef.current).add(alert.key);
    const message =
      alert.minutesAway <= 5
        ? "Rain is starting"
        : `Rain expected in about ${alert.minutesAway} min`;
    toast(message, { icon: <CloudRain className="size-4" /> });
    if (voiceEnabled) speak(message);
  }, [hourlyRain, finished, voiceEnabled]);

  // Direction of travel: the route itself is steadier than live GPS heading,
  // which is often null or noisy at cycling speeds.
  const travelBearing = useMemo(() => {
    if (ride && snap) {
      const along = routeBearing(ride.points, snap.index);
      if (along !== null) return along;
    }
    return fix?.heading ?? null;
  }, [ride, snap, fix]);

  const wind = useMemo(() => {
    if (!weather || travelBearing === null) return null;
    const relativeAngle = windRelativeAngle(travelBearing, weather.windDirectionDeg);
    return {
      effect: windEffect(relativeAngle),
      componentMs: windComponent(weather.windSpeedMs, relativeAngle),
    };
  }, [weather, travelBearing]);

  const FINISH_RADIUS_M = 20;
  useEffect(() => {
    if (finished || !ride || !snap) return;
    // Deliberate one-way latch, not a plain derived value: it must persist
    // once true so GPS jitter briefly pushing progress back doesn't un-finish the ride.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ride.distance_m - snap.progressM <= FINISH_RADIUS_M) setFinished(true);
  }, [ride, snap, finished]);

  // Alerts the rider once per note as they approach it. Runs off the same
  // live position stream navigation already uses, not a separate
  // background-geolocation plugin — see findProximityAlert's doc comment.
  const alertedNoteIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    alertedNoteIdsRef.current = new Set();
  }, [ride?.id]);

  useEffect(() => {
    if (finished || !ride || !snap) return;
    const alert = findProximityAlert(ride.notes ?? [], snap.progressM, alertedNoteIdsRef.current);
    if (!alert) return;
    alertedNoteIdsRef.current = new Set(alertedNoteIdsRef.current).add(alert.id);
    toast(`Coming up: ${alert.text}`, { icon: <StickyNote className="size-4" /> });
    if (typeof navigator !== "undefined" && "vibrate" in navigator)
      navigator.vibrate([120, 60, 120]);
  }, [ride, snap, finished]);

  // Elapsed time / speed history: started from the first GPS fix (not page
  // load), so a rider who takes a minute to get moving doesn't see average
  // speed/ETA skewed by dead time before the ride actually started.
  const startTimeRef = useRef<number | null>(null);
  const lastSampleAtSecRef = useRef(-Infinity);
  useEffect(() => {
    startTimeRef.current = null;
    lastSampleAtSecRef.current = -Infinity;
    // Resets the ride-clock state for a fresh ride id — not a value derived
    // from props/state, so there's no callback to move this into.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpeedHistory([]);
    setElapsedSec(0);
    setAvgSpeedMps(null);
    setEtaLabel("—");
  }, [ride?.id]);

  // Elapsed time / average speed / ETA all read Date.now() and a ref, which
  // aren't allowed during render (they'd make the render impure) — computed
  // here instead and pushed into state for the JSX below to read.
  useEffect(() => {
    if (!fix) return;
    if (startTimeRef.current === null) startTimeRef.current = Date.now();
    const nowMs = Date.now();
    const elapsed = (nowMs - startTimeRef.current) / 1000;
    setElapsedSec(elapsed);

    const avg = snap && elapsed > 10 ? snap.progressM / elapsed : null;
    setAvgSpeedMps(avg);

    const remaining = ride ? Math.max(0, ride.distance_m - (snap?.progressM ?? 0)) : 0;
    const eta = avg && avg > 0.3 ? remaining / avg : null;
    setEtaLabel(
      eta != null
        ? new Date(nowMs + eta * 1000).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })
        : "—",
    );

    if (fix.speed == null) return;
    if (elapsed - lastSampleAtSecRef.current < 5) return;
    lastSampleAtSecRef.current = elapsed;
    setSpeedHistory((prev) => {
      const next = [...prev, { tSec: elapsed, speedMps: fix.speed ?? 0 }];
      // Halve resolution once the buffer gets long, so an hours-long ride
      // doesn't grow the sample array (and the chart's render cost)
      // unbounded — still covers the whole ride, just at coarser detail.
      return next.length > 240 ? next.filter((_, i) => i % 2 === 0) : next;
    });
  }, [fix, snap, ride]);

  // Voice turn announcements: fires once per distance threshold per turn
  // (see nextTurnAnnouncement's doc comment), enriched with a street name
  // from the cue sheet when the router provided one close enough to this
  // turn to plausibly be the same one.
  const announcedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    announcedRef.current = new Set();
  }, [ride?.id]);

  useEffect(() => {
    if (!voiceEnabled || finished || !turn || turnDistanceM === null) return;
    const next = nextTurnAnnouncement(turn.index, turnDistanceM, announcedRef.current);
    if (!next) return;
    announcedRef.current = new Set(announcedRef.current).add(next.key);
    const name = nearestCueName(cueSheet, turn.at);
    speak(`In ${speakableDistance(next.thresholdM, metric)}, ${cueText(turn.direction, name)}`);
  }, [voiceEnabled, finished, turn, turnDistanceM, cueSheet, metric]);

  const announcedFinishRef = useRef(false);
  useEffect(() => {
    announcedFinishRef.current = false;
  }, [ride?.id]);
  useEffect(() => {
    if (!voiceEnabled || !finished || announcedFinishRef.current) return;
    announcedFinishRef.current = true;
    speak("You've arrived at your destination");
  }, [voiceEnabled, finished]);

  useWakeLock(Boolean(ride) && !finished);

  // Apply the nav-only high-contrast palette directly to <html>, alongside
  // (not instead of) the app's own light/dark class — layoutEffect so this
  // lands before RouteMap's passive effect re-resolves --color-* off the DOM.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("hc-dark", highContrast);
    root.classList.toggle("dark", highContrast || theme === "dark");
    window.localStorage.setItem(HC_STORAGE_KEY, highContrast ? "1" : "0");
    return () => {
      root.classList.remove("hc-dark");
      root.classList.toggle("dark", theme === "dark");
    };
  }, [highContrast, theme]);

  if (isLoading || !ride) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  const remainingM = Math.max(0, ride.distance_m - (snap?.progressM ?? 0));
  const progressPct =
    ride.distance_m > 0 ? Math.min(100, ((snap?.progressM ?? 0) / ride.distance_m) * 100) : 0;
  const grade = snap ? upcomingGrade(ride.points, snap.index) : 0;
  const climbLeft = snap ? remainingAscent(ride.points, snap.index) : ride.ascent_m;
  const turnDistance = turnDistanceM;

  // Direction to start riding: along the cycling path when we have one.
  const rejoinStep = rejoinRoute?.path?.[1] ?? (snap ? { lat: snap.lat, lon: snap.lon } : null);
  const rejoinBearing =
    offRoute && fix && rejoinStep
      ? bearing(fix.lat, fix.lon, rejoinStep.lat, rejoinStep.lon)
      : null;
  const rejoinDistanceM = rejoinRoute?.routed ? rejoinRoute.distanceM : (snap?.offRouteM ?? 0);

  const showRejoinOnMap = () => {
    if (!fix || !snap) return;
    setFollow(false);
    setFitTo({
      coords:
        rejoinRoute && rejoinRoute.path.length >= 2
          ? rejoinRoute.path
          : [
              { lat: fix.lat, lon: fix.lon },
              { lat: snap.lat, lon: snap.lon },
            ],
      nonce: Date.now(),
    });
  };

  return (
    <div className="screen-fill relative overflow-hidden bg-background">
      <RouteMap
        points={ride.points}
        className="absolute inset-0 h-full w-full"
        live={fix}
        follow={follow}
        progressIndex={snap?.index ?? null}
        pitch={angled ? 60 : 0}
        highContrast={highContrast}
        rejoin={offRoute && snap ? { lat: snap.lat, lon: snap.lon } : null}
        rejoinPath={offRoute ? (rejoinRoute?.path ?? null) : null}
        notes={ride.notes ?? []}
        fitTo={fitTo}
        showFitControl={false}
        showZoomControl={false}
      />

      {/*
       * Overlay chrome, laid out top-to-bottom: the maneuver banner sits where
       * the eye lands first, secondary controls collapse into an icon rail at
       * the right thumb, and the stats card anchors the bottom. The bottom
       * padding clears the Android gesture bar / iOS home indicator — the map
       * runs edge to edge underneath, but nothing tappable does.
       */}
      <div className="pointer-events-none relative z-10 flex h-full flex-col gap-2 p-3 pb-[calc(0.75rem+var(--safe-area-inset-bottom))]">
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
          <Button
            asChild
            variant="secondary"
            size="sm"
            className="glass pointer-events-auto h-10 rounded-full px-4"
          >
            <Link to="/rides/$id" params={{ id: ride.id }}>
              <ArrowLeft className="size-4" />
              End
            </Link>
          </Button>

          {weather && (
            <div className="glass pointer-events-auto ml-auto flex max-w-full flex-wrap items-center justify-end gap-x-3 gap-y-0.5 rounded-2xl px-3 py-1.5 text-xs">
              <WeatherGlyph
                icon={weatherInfo(weather.weatherCode, weather.isDay).icon}
                className="size-4 shrink-0 text-primary"
              />
              <span className="font-mono font-semibold leading-none">
                {formatTemperature(weather.temperatureC, metric)}
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap font-mono leading-none text-muted-foreground">
                <Wind className="size-3.5 shrink-0" aria-hidden />
                {formatWindSpeed(weather.windSpeedMs, metric)}{" "}
                {compassAbbrev(weather.windDirectionDeg)}
              </span>
              {/* Named, not just color-coded: on a bike this is the number
                  that explains why the ride feels the way it does. */}
              {wind && Math.abs(wind.componentMs) > 1 && (
                <span
                  className={cn(
                    "whitespace-nowrap font-semibold uppercase leading-none tracking-wide",
                    wind.effect === "headwind"
                      ? "text-destructive"
                      : wind.effect === "tailwind"
                        ? "text-primary"
                        : "text-muted-foreground",
                  )}
                >
                  {windLabel(wind.effect)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* The one thing that has to be readable at 30 km/h. */}
        {!finished &&
          (offRoute && snap ? (
            <div className="glass pointer-events-auto shrink-0 rounded-2xl border-destructive/40 p-3">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-destructive text-destructive-foreground"
                  aria-hidden
                >
                  <Navigation
                    className="size-7"
                    style={{
                      transform: `rotate(${(rejoinBearing ?? 0) - (fix?.heading ?? 0)}deg)`,
                    }}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="stat-figure text-3xl font-bold leading-none text-destructive">
                    {formatDistance(rejoinDistanceM, metric)}
                  </p>
                  <p className="mt-1.5 font-serif text-sm italic leading-snug text-muted-foreground">
                    {rejoinLoading && !rejoinRoute
                      ? "Finding a cycling route back to the track…"
                      : rejoinRoute?.routed
                        ? `Follow the route back — head ${rejoinBearing !== null ? compassLabel(rejoinBearing) : "—"} to start`
                        : `Head ${rejoinBearing !== null ? compassLabel(rejoinBearing) : "—"} to the closest point of the route`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-9 shrink-0 rounded-full"
                  onClick={showRejoinOnMap}
                >
                  Show
                </Button>
              </div>
            </div>
          ) : (
            <div className="glass pointer-events-auto shrink-0 rounded-2xl p-3">
              <div className="flex items-center gap-3">
                <span
                  className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
                  aria-hidden
                >
                  {turn ? (
                    turn.direction.includes("left") ? (
                      <CornerDownLeft className="size-7" />
                    ) : (
                      <CornerDownRight className="size-7" />
                    )
                  ) : (
                    <Flag className="size-6" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="stat-figure text-3xl font-bold leading-none">
                    {turn
                      ? turnDistance !== null
                        ? formatDistance(turnDistance, metric)
                        : "—"
                      : formatDistance(remainingM, metric)}
                  </p>
                  <p className="mt-1.5 truncate font-serif text-base italic leading-snug text-muted-foreground">
                    {turn
                      ? cueText(turn.direction, nearestCueName(cueSheet, turn.at))
                      : "Continue straight to the finish"}
                  </p>
                </div>
              </div>
            </div>
          ))}

        {geoError && (
          <div className="glass-faint pointer-events-auto flex shrink-0 items-center gap-2 rounded-xl p-2.5 text-xs text-destructive">
            <TriangleAlert className="size-3.5 shrink-0" />
            {geoError} — allow location access to navigate.
          </div>
        )}

        {/*
         * Spacer that keeps the map visible, with the control rail sitting on
         * its bottom edge, just above the stats card and under the thumb. The
         * rail is a row rather than a column on purpose: five stacked buttons
         * are taller than the space left on a short phone and end up drawn
         * over the maneuver banner, where a single row always fits.
         */}
        <div className="flex min-h-0 flex-1 items-end justify-end">
          <div className="pointer-events-auto flex flex-wrap justify-end gap-2">
            <RailButton
              active={follow}
              label={follow ? "Stop following my position" : "Recenter on my position"}
              pressed={follow}
              onClick={() => setFollow((value) => !value)}
            >
              <Crosshair className="size-5" />
            </RailButton>

            {isVoiceSupported() && (
              <RailButton
                active={voiceEnabled}
                label={
                  voiceEnabled ? "Turn off voice announcements" : "Turn on voice announcements"
                }
                pressed={voiceEnabled}
                onClick={() => {
                  setVoiceEnabled((value) => {
                    const next = !value;
                    setVoicePreference(next);
                    return next;
                  });
                }}
              >
                {voiceEnabled ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
              </RailButton>
            )}

            <RailButton
              active={highContrast}
              label={highContrast ? "Turn off high contrast" : "Turn on high contrast"}
              pressed={highContrast}
              onClick={() => setHighContrast((value) => !value)}
            >
              <Contrast className="size-5" />
            </RailButton>

            <RailButton
              active={angled}
              label={angled ? "Switch to bird's-eye view" : "Switch to angled view"}
              pressed={angled}
              onClick={() => setAngled((value) => !value)}
            >
              {angled ? <MapIcon className="size-5" /> : <Box className="size-5" />}
            </RailButton>

            <RailButton
              label={bottomMinimized ? "Show ride stats" : "Hide ride stats"}
              onClick={() => setBottomMinimized((value) => !value)}
            >
              {bottomMinimized ? (
                <Maximize2 className="size-5" />
              ) : (
                <Minimize2 className="size-5" />
              )}
            </RailButton>
          </div>
        </div>

        {finished ? (
          <div className="glass pointer-events-auto shrink-0 space-y-3 rounded-2xl p-4 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CheckCircle2 className="size-6" />
            </span>
            <div>
              <p className="font-serif text-2xl italic leading-none">Ride complete</p>
              <p className="mt-2 text-xs text-muted-foreground">
                You've reached the end of {ride.name}.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-left">
              <Metric label="Distance" value={formatDistance(ride.distance_m, metric)} />
              <Metric label="Climbed" value={formatElevation(ride.ascent_m, metric)} />
              <Metric label="Elapsed" value={formatDuration(elapsedSec)} />
            </div>
            <Button asChild className="w-full" size="lg">
              <Link to="/rides/$id" params={{ id: ride.id }}>
                Finish ride
              </Link>
            </Button>
          </div>
        ) : (
          !bottomMinimized && (
            /*
             * Scrolls within itself rather than growing the page: on a short
             * screen the metrics and charts can exceed the space left under
             * the maneuver banner, and the page itself is height-locked so it
             * can't scroll to reveal them. `max-h-[45%]` keeps the map at
             * least half visible whatever ends up inside.
             */
            <div className="glass pointer-events-auto max-h-[45%] shrink-0 overflow-y-auto overscroll-contain rounded-2xl p-3">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-border"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressPct)}
                aria-label="Route progress"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
                <Metric label="To go" value={formatDistance(remainingM, metric)} />
                <Metric label="Climb left" value={formatElevation(climbLeft, metric)} />
                <Metric label="Grade" value={`${grade > 0 ? "+" : ""}${grade.toFixed(1)}%`} />
                <Metric
                  label="Speed"
                  value={fix?.speed != null ? formatSpeed(fix.speed, metric) : "—"}
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3">
                <Metric label="Elapsed" value={formatDuration(elapsedSec)} />
                <Metric
                  label="Avg speed"
                  value={avgSpeedMps != null ? formatSpeed(avgSpeedMps, metric) : "—"}
                />
                <Metric label="ETA" value={etaLabel} />
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <ElevationChart
                  points={ride.points}
                  metric={metric}
                  progressM={snap?.progressM ?? null}
                  height={64}
                />
              </div>

              {speedHistory.length > 1 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                    Speed
                  </p>
                  <SpeedHistoryChart samples={speedHistory} metric={metric} height={52} />
                </div>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
}

/** Tooltip text for the wind chip — the spoken form of a WindEffect. */
function windLabel(effect: WindEffect): string {
  if (effect === "headwind") return "Headwind";
  if (effect === "tailwind") return "Tailwind";
  return "Crosswind";
}

/**
 * A control-rail button: icon-only and circular, so five of them stack into
 * the corner without the wrapping pill row they used to form. `active` gives
 * the same filled treatment the labelled `default` button variant has.
 */
function RailButton({
  children,
  label,
  onClick,
  active = false,
  pressed,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  pressed?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant={active ? "default" : "secondary"}
      className={cn("size-11 rounded-full [&_svg]:size-5", !active && "glass")}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-bold">{value}</p>
    </div>
  );
}
