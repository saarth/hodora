/**
 * Real-time weather for the rider's live position, fetched client side from
 * the free public Open-Meteo API — no key needed, same spirit as the OSM
 * routers in routing.ts.
 */
import { useEffect, useRef, useState } from "react";
import { haversine } from "./gpx";
import type { LatLon } from "./routing";

export type WeatherFix = {
  temperatureC: number;
  apparentTemperatureC: number;
  precipitationMm: number;
  weatherCode: number;
  windSpeedMs: number;
  windGustMs: number;
  /** degrees the wind is blowing FROM, meteorological convention */
  windDirectionDeg: number;
  isDay: boolean;
  fetchedAt: number;
};

const WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const CURRENT_FIELDS =
  "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day";

/** Fetches current conditions for a coordinate. Values are SI (°C, m/s); convert for display. */
export async function fetchWeather(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<WeatherFix> {
  const url = `${WEATHER_ENDPOINT}?latitude=${lat}&longitude=${lon}&current=${CURRENT_FIELDS}&wind_speed_unit=ms&timezone=auto`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
  const data = await response.json();
  const current = data?.current;
  if (!current || typeof current.temperature_2m !== "number")
    throw new Error("Open-Meteo: no current weather");
  return {
    temperatureC: Number(current.temperature_2m),
    apparentTemperatureC: Number(current.apparent_temperature),
    precipitationMm: Number(current.precipitation) || 0,
    weatherCode: Number(current.weather_code),
    windSpeedMs: Number(current.wind_speed_10m) || 0,
    windGustMs: Number(current.wind_gusts_10m) || 0,
    windDirectionDeg: Number(current.wind_direction_10m) || 0,
    isDay: current.is_day !== 0,
    fetchedAt: Date.now(),
  };
}

export type HourlyForecast = {
  /** local timestamp for this slot, e.g. "2026-08-16T15:00" (no UTC offset — Open-Meteo's `timezone=auto`) */
  atIso: string;
  temperatureC: number;
  windSpeedMs: number;
  /** degrees the wind is blowing FROM, meteorological convention */
  windDirectionDeg: number;
  weatherCode: number;
};

const HOURLY_FIELDS = "temperature_2m,wind_speed_10m,wind_direction_10m,weather_code";
const DEFAULT_FORECAST_DAYS = 8;

// Keyed by rounded coordinate + day count so paging the day/hour pickers for
// the same route never refetches. Forecasts change slowly enough that
// ~1km-precision coordinates are an appropriate cache granularity.
const hourlyCache = new Map<string, Promise<HourlyForecast[]>>();

/**
 * Fetches an hourly wind/temperature forecast for a coordinate, `forecastDays`
 * days out. Values are SI (°C, m/s); convert for display. Shares one in-flight
 * or resolved request per rounded coordinate — callers don't need their own
 * caching layer.
 */
export function fetchHourlyWind(
  lat: number,
  lon: number,
  forecastDays = DEFAULT_FORECAST_DAYS,
): Promise<HourlyForecast[]> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}:${forecastDays}`;
  const cached = hourlyCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    const url = `${WEATHER_ENDPOINT}?latitude=${lat}&longitude=${lon}&hourly=${HOURLY_FIELDS}&wind_speed_unit=ms&timezone=auto&forecast_days=${forecastDays}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const data = await response.json();
    const hourly = data?.hourly;
    if (!Array.isArray(hourly?.time)) throw new Error("Open-Meteo: no hourly forecast");
    return hourly.time.map((atIso: string, i: number): HourlyForecast => ({
      atIso,
      temperatureC: Number(hourly.temperature_2m?.[i]) || 0,
      windSpeedMs: Number(hourly.wind_speed_10m?.[i]) || 0,
      windDirectionDeg: Number(hourly.wind_direction_10m?.[i]) || 0,
      weatherCode: Number(hourly.weather_code?.[i]) || 0,
    }));
  })();

  hourlyCache.set(key, promise);
  promise.catch(() => hourlyCache.delete(key));
  return promise;
}

export type ForecastDay = {
  /** local calendar date this bucket covers, e.g. "2026-08-16" */
  dateKey: string;
  label: string;
  hours: HourlyForecast[];
};

/**
 * Groups a flat hourly forecast into per-day buckets with "Today"/"Tomorrow"/
 * weekday labels. Relies on Open-Meteo always starting the forecast at the
 * location's current local day, so the first two buckets in list order are
 * always today and tomorrow.
 */
export function groupForecastByDay(hourly: HourlyForecast[]): ForecastDay[] {
  const days = new Map<string, HourlyForecast[]>();
  for (const hour of hourly) {
    const dateKey = hour.atIso.slice(0, 10);
    const bucket = days.get(dateKey);
    if (bucket) bucket.push(hour);
    else days.set(dateKey, [hour]);
  }

  const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });

  return Array.from(days.entries()).map(([dateKey, hours], index) => {
    let label: string;
    if (index === 0) label = "Today";
    else if (index === 1) label = "Tomorrow";
    else label = dayFormatter.format(new Date(`${dateKey}T00:00:00`));
    return { dateKey, label, hours };
  });
}

/**
 * Index of the forecast hour closest to the current local hour-of-day, used
 * to pick a sensible default slot. Compares hour-of-day only (not full
 * date/time) so it's independent of the visitor's own timezone — the first,
 * closest match in list order naturally falls within today's bucket.
 */
export function closestHourIndex(hourly: HourlyForecast[], atHour = new Date().getHours()): number {
  let bestIndex = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < hourly.length; i++) {
    const hour = Number(hourly[i].atIso.slice(11, 13));
    const diff = Math.abs(hour - atHour);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Rough daytime guess (6am-8pm) for an hourly forecast slot, read directly
 * off its local timestamp string — hourly forecasts don't include the
 * sunrise/sunset-derived `is_day` flag that `fetchWeather` gets for free.
 */
export function isDaytimeHour(atIso: string): boolean {
  const hour = Number(atIso.slice(11, 13));
  return hour >= 6 && hour < 20;
}

/** "3pm"-style label for an hourly forecast slot, read directly off its local timestamp string. */
export function formatHourLabel(atIso: string): string {
  const hour = Number(atIso.slice(11, 13));
  if (!Number.isFinite(hour)) return atIso;
  const period = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${period}`;
}

/**
 * Keeps live weather in sync with the rider without hammering the API:
 * refreshes on a timer, and sooner if the rider has moved far enough that
 * conditions may genuinely differ.
 */
export function useWeather(
  position: LatLon | null,
  { minMoveM = 5000, minIntervalMs = 10 * 60 * 1000, pollMs = 60_000 } = {},
): { weather: WeatherFix | null; loading: boolean; error: boolean } {
  const [weather, setWeather] = useState<WeatherFix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastRef = useRef<{ at: LatLon; time: number } | null>(null);
  const positionRef = useRef(position);
  positionRef.current = position;

  const hasPosition = Boolean(position);

  useEffect(() => {
    if (!hasPosition) return;

    let cancelled = false;
    let controller: AbortController | null = null;

    const maybeFetch = () => {
      const current = positionRef.current;
      if (!current) return;
      const last = lastRef.current;
      const moved =
        !last || haversine(last.at.lat, last.at.lon, current.lat, current.lon) > minMoveM;
      const stale = !last || Date.now() - last.time > minIntervalMs;
      if (!moved && !stale) return;

      lastRef.current = { at: current, time: Date.now() };
      controller = new AbortController();
      setLoading(true);
      fetchWeather(current.lat, current.lon, controller.signal)
        .then((result) => {
          if (cancelled) return;
          setWeather(result);
          setError(false);
        })
        .catch(() => {
          if (cancelled || controller?.signal.aborted) return;
          setError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    maybeFetch();
    const interval = setInterval(maybeFetch, pollMs);
    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPosition]);

  return { weather, loading, error };
}

export function formatTemperature(celsius: number, metric = true): string {
  if (!Number.isFinite(celsius)) return "—";
  return metric ? `${Math.round(celsius)}°C` : `${Math.round((celsius * 9) / 5 + 32)}°F`;
}

export function formatWindSpeed(mps: number, metric = true): string {
  if (!Number.isFinite(mps)) return "—";
  return metric ? `${Math.round(mps * 3.6)} km/h` : `${Math.round(mps * 2.236936)} mph`;
}

export type WeatherIconKey =
  | "sun"
  | "moon"
  | "cloud-sun"
  | "cloud-moon"
  | "cloud"
  | "cloud-fog"
  | "cloud-drizzle"
  | "cloud-rain"
  | "cloud-snow"
  | "cloud-lightning";

/** Maps a WMO weather code (as returned by Open-Meteo) to a label + icon key. */
export function weatherInfo(code: number, isDay = true): { label: string; icon: WeatherIconKey } {
  switch (code) {
    case 0:
      return { label: "Clear sky", icon: isDay ? "sun" : "moon" };
    case 1:
      return { label: "Mainly clear", icon: isDay ? "cloud-sun" : "cloud-moon" };
    case 2:
      return { label: "Partly cloudy", icon: isDay ? "cloud-sun" : "cloud-moon" };
    case 3:
      return { label: "Overcast", icon: "cloud" };
    case 45:
    case 48:
      return { label: "Fog", icon: "cloud-fog" };
    case 51:
    case 53:
    case 55:
      return { label: "Drizzle", icon: "cloud-drizzle" };
    case 56:
    case 57:
      return { label: "Freezing drizzle", icon: "cloud-drizzle" };
    case 61:
    case 63:
    case 65:
      return { label: "Rain", icon: "cloud-rain" };
    case 66:
    case 67:
      return { label: "Freezing rain", icon: "cloud-rain" };
    case 71:
    case 73:
    case 75:
    case 77:
      return { label: "Snow", icon: "cloud-snow" };
    case 80:
    case 81:
    case 82:
      return { label: "Rain showers", icon: "cloud-rain" };
    case 85:
    case 86:
      return { label: "Snow showers", icon: "cloud-snow" };
    case 95:
      return { label: "Thunderstorm", icon: "cloud-lightning" };
    case 96:
    case 99:
      return { label: "Thunderstorm with hail", icon: "cloud-lightning" };
    default:
      return { label: "Weather", icon: "cloud" };
  }
}
