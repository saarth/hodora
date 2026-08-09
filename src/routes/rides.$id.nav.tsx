import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  CornerDownLeft,
  CornerDownRight,
  Crosshair,
  Flag,
  Loader2,
  Box,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Moon,
  Navigation,
  Sun,
  TriangleAlert,
  Wind,
} from "lucide-react";
import { RouteMap } from "@/components/RouteMap";
import { ElevationChart } from "@/components/ElevationChart";
import { Button } from "@/components/ui/button";
import { bearing, formatDistance, formatElevation, formatSpeed } from "@/lib/gpx";
import {
  compassLabel,
  detectTurns,
  nextTurn,
  remainingAscent,
  routeBearing,
  snapToRoute,
  turnLabel,
  upcomingGrade,
  windComponent,
  windEffect,
  windRelativeAngle,
  type Snap,
} from "@/lib/nav";
import { useRejoinRoute } from "@/lib/rejoin";
import { fetchProfile, fetchRide, ridesKeys } from "@/lib/rides";
import { formatTemperature, formatWindSpeed, useWeather, weatherInfo, type WeatherIconKey } from "@/lib/weather";
import { useWakeLock } from "@/hooks/use-wake-lock";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rides/$id/nav")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Navigate — Hodora" },
      {
        name: "description",
        content: "Live turn-by-turn navigation along your GPX route with distance to go, next turn and off-route alerts.",
      },
      { property: "og:title", content: "Navigate — Hodora" },
      { property: "og:description", content: "Live turn-by-turn navigation along your GPX route." },
    ],
  }),
  component: NavigatePage,
});

type LiveFix = {
  lat: number;
  lon: number;
  heading: number | null;
  speed: number | null;
};

const WEATHER_ICONS: Record<WeatherIconKey, typeof Cloud> = {
  sun: Sun,
  moon: Moon,
  "cloud-sun": CloudSun,
  "cloud-moon": CloudMoon,
  cloud: Cloud,
  "cloud-fog": CloudFog,
  "cloud-drizzle": CloudDrizzle,
  "cloud-rain": CloudRain,
  "cloud-snow": CloudSnow,
  "cloud-lightning": CloudLightning,
};

function WeatherGlyph({ icon, className }: { icon: WeatherIconKey; className?: string }) {
  const Icon = WEATHER_ICONS[icon];
  return <Icon className={className} aria-hidden />;
}

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
  const [topMinimized, setTopMinimized] = useState(false);
  const [bottomMinimized, setBottomMinimized] = useState(false);
  const [finished, setFinished] = useState(false);
  const [fitTo, setFitTo] = useState<{
    coords: { lat: number; lon: number }[];
    nonce: number;
  } | null>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeoError("This device doesn't support location.");
      return;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGeoError(null);
        setFix({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          heading: Number.isFinite(position.coords.heading ?? NaN)
            ? position.coords.heading
            : null,
          speed: Number.isFinite(position.coords.speed ?? NaN) ? position.coords.speed : null,
        });
      },
      (error) => setGeoError(error.message || "Location unavailable."),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  const turns = useMemo(() => (ride ? detectTurns(ride.points) : []), [ride]);

  const snap: Snap | null = useMemo(() => {
    if (!ride || !fix) return null;
    return snapToRoute(ride.points, fix.lat, fix.lon);
  }, [ride, fix]);

  const offRoute = snap ? snap.offRouteM > 40 : false;
  // Bike-friendly path back to the track, refreshed as the rider moves.
  const { route: rejoinRoute, loading: rejoinLoading } = useRejoinRoute(
    fix ? { lat: fix.lat, lon: fix.lon } : null,
    offRoute && snap ? { lat: snap.lat, lon: snap.lon } : null,
    offRoute,
  );

  const turn = useMemo(
    () => (snap ? nextTurn(turns, snap.progressM) : null),
    [snap, turns],
  );

  // Live position when we have a GPS fix, otherwise the route's start — so
  // conditions are visible even before location is granted or locked in.
  const weatherPosition = useMemo(() => {
    if (fix) return { lat: fix.lat, lon: fix.lon };
    const start = ride?.points[0];
    return start ? { lat: start.lat, lon: start.lon } : null;
  }, [fix, ride]);
  const { weather } = useWeather(weatherPosition);

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
    if (ride.distance_m - snap.progressM <= FINISH_RADIUS_M) setFinished(true);
  }, [ride, snap, finished]);

  useWakeLock(Boolean(ride) && !finished);

  if (isLoading || !ride) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  const remainingM = Math.max(0, ride.distance_m - (snap?.progressM ?? 0));
  const grade = snap ? upcomingGrade(ride.points, snap.index) : 0;
  const climbLeft = snap ? remainingAscent(ride.points, snap.index) : ride.ascent_m;
  const turnDistance = turn && snap ? Math.max(0, turn.at - snap.progressM) : null;
  // Direction to start riding: along the cycling path when we have one.
  const rejoinStep = rejoinRoute?.path?.[1] ?? (snap ? { lat: snap.lat, lon: snap.lon } : null);
  const rejoinBearing =
    offRoute && fix && rejoinStep ? bearing(fix.lat, fix.lon, rejoinStep.lat, rejoinStep.lon) : null;
  const rejoinDistanceM = rejoinRoute?.routed ? rejoinRoute.distanceM : snap?.offRouteM ?? 0;


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
    <div className="relative min-h-screen bg-background">
      <RouteMap
        points={ride.points}
        className="absolute inset-0 h-full w-full"
        live={fix}
        follow={follow}
        progressIndex={snap?.index ?? null}
        pitch={angled ? 60 : 0}
        rejoin={offRoute && snap ? { lat: snap.lat, lon: snap.lon } : null}
        rejoinPath={offRoute ? rejoinRoute?.path ?? null : null}

        fitTo={fitTo}
        showFitControl={false}
      />


      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-4">
        <div className="pointer-events-auto flex items-start gap-2">
          {!topMinimized ? (
            <>
              <Button asChild variant="secondary" size="sm" className="glass">
                <Link to="/rides/$id" params={{ id: ride.id }}>
                  <ArrowLeft className="size-4" />
                  End
                </Link>
              </Button>
              <Button
                variant={follow ? "default" : "secondary"}
                size="sm"
                className={follow ? "" : "glass"}
                onClick={() => setFollow((value) => !value)}
              >
                <Crosshair className="size-4" />
                {follow ? "Following" : "Recenter"}
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="glass"
                aria-label="Minimise top controls"
                onClick={() => setTopMinimized(true)}
              >
                <Minimize2 className="size-4" />
              </Button>
            </>
          ) : (
            <Button
              size="icon"
              variant="secondary"
              className="glass"
              aria-label="Expand top controls"
              onClick={() => setTopMinimized(false)}
            >
              <Maximize2 className="size-4" />
            </Button>
          )}
        </div>

        <div className="space-y-3">
          <div className="pointer-events-auto flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="glass"
              onClick={() => setAngled((value) => !value)}
              aria-label={angled ? "Switch to birds-eye view" : "Switch to angled view"}
            >
              {angled ? <MapIcon className="size-4" /> : <Box className="size-4" />}
              {angled ? "Birds-eye" : "Angled"}
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="glass"
              aria-label={bottomMinimized ? "Expand navigation info" : "Minimise navigation info"}
              onClick={() => setBottomMinimized((value) => !value)}
            >
              {bottomMinimized ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
            </Button>
          </div>

          {!bottomMinimized && (
            <div className="pointer-events-auto space-y-2">
          {finished ? (
            <div className="glass-faint space-y-3 rounded-2xl p-4 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                <CheckCircle2 className="size-6" />
              </span>
              <div>
                <p className="text-lg font-bold leading-none">Ride complete!</p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  You've reached the end of {ride.name}.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-left">
                <Metric label="Distance" value={formatDistance(ride.distance_m, metric)} />
                <Metric label="Elevation gain" value={formatElevation(ride.ascent_m, metric)} />
              </div>
              <Button asChild className="w-full">
                <Link to="/rides/$id" params={{ id: ride.id }}>
                  Finish ride
                </Link>
              </Button>
            </div>
          ) : (
            <>
          {geoError && (
            <div className="glass-faint flex items-center gap-2 rounded-xl p-2.5 text-xs text-destructive">
              <TriangleAlert className="size-3.5 shrink-0" />
              {geoError} Allow location access to navigate.
            </div>
          )}

          {weather && (
            <div className="glass-faint flex items-center gap-2.5 rounded-xl p-2.5 text-xs">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <WeatherGlyph
                  icon={weatherInfo(weather.weatherCode, weather.isDay).icon}
                  className="size-4"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-none">
                  {formatTemperature(weather.temperatureC, metric)}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {weatherInfo(weather.weatherCode, weather.isDay).label}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                <Wind className="size-3.5 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">
                  {formatWindSpeed(weather.windSpeedMs, metric)} {compassLabel(weather.windDirectionDeg)}
                </span>
              </div>
              {wind && wind.effect !== "crosswind" && Math.abs(wind.componentMs) > 1 && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    wind.effect === "headwind"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-primary/15 text-primary",
                  )}
                >
                  {wind.effect === "headwind" ? "Headwind" : "Tailwind"}
                </span>
              )}
            </div>
          )}

          {offRoute && snap && (
            <div className="glass-faint space-y-2 rounded-xl border border-destructive/30 p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                <TriangleAlert className="size-3.5 shrink-0" />
                Off route — {formatDistance(snap.offRouteM, metric)} from the track
              </div>
              <div className="flex items-center gap-2.5">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive"
                  aria-hidden
                >
                  <Navigation
                    className="size-4"
                    style={{
                      transform: `rotate(${(rejoinBearing ?? 0) - (fix?.heading ?? 0)}deg)`,
                    }}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-base font-bold leading-none">
                    {formatDistance(rejoinDistanceM, metric)}
                  </p>
                  <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
                    {rejoinLoading && !rejoinRoute
                      ? "Finding a cycling route back to the track…"
                      : rejoinRoute?.routed
                        ? `Follow the orange cycling route — head ${rejoinBearing !== null ? compassLabel(rejoinBearing) : "—"} to start`
                        : `Head ${rejoinBearing !== null ? compassLabel(rejoinBearing) : "—"} to the closest point of the route`}
                  </p>
                </div>

                <Button size="sm" variant="secondary" className="glass-faint h-8 text-xs" onClick={showRejoinOnMap}>
                  Show
                </Button>
              </div>
            </div>
          )}

          <div className="glass-faint rounded-2xl p-3">
            {turn ? (
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary",
                  )}
                >
                  {turn.direction.includes("left") ? (
                    <CornerDownLeft className="size-5" />
                  ) : (
                    <CornerDownRight className="size-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-xl font-bold leading-none">
                    {turnDistance !== null ? formatDistance(turnDistance, metric) : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {turnLabel(turn.direction)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Flag className="size-4" />
                </span>
                <div>
                  <p className="font-mono text-xl font-bold leading-none">
                    {formatDistance(remainingM, metric)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Continue straight to the finish
                  </p>
                </div>
              </div>
            )}

            <div className="mt-3 grid grid-cols-4 gap-2 border-t border-border pt-3">
              <Metric label="To go" value={formatDistance(remainingM, metric)} />
              <Metric label="Climb left" value={formatElevation(climbLeft, metric)} />
              <Metric label="Grade" value={`${grade > 0 ? "+" : ""}${grade.toFixed(1)}%`} />
              <Metric
                label="Speed"
                value={fix?.speed != null ? formatSpeed(fix.speed, metric) : "—"}
              />
            </div>

            <div className="mt-3">
              <ElevationChart
                points={ride.points}
                metric={metric}
                progressM={snap?.progressM ?? null}
                height={70}
              />
            </div>
          </div>
          </>
          )}
          </div>
          )}
        </div>
      </div>
    </div>
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
