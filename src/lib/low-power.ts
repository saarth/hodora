/**
 * Low-power mode: a rider-controlled preference (persisted like the nav
 * high-contrast/voice toggles) that trades GPS/weather-refresh precision
 * and frequency for battery life during long rides. Purely a client
 * preference — no account/profile involved, so it works for signed-out
 * guests too.
 */

const STORAGE_KEY = "hodora-low-power";

export function getLowPowerMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setLowPowerMode(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

/**
 * `navigator.geolocation.watchPosition`/`getCurrentPosition` options tuned
 * for the rider's chosen power/precision tradeoff. Normal mode keeps the
 * existing high-accuracy behavior; low-power mode turns off GPS-chip high
 * accuracy (the single biggest location-battery cost — it falls back to
 * coarser wifi/network positioning) and accepts a longer-lived cached fix,
 * both of which let the OS poll the radio less often.
 */
export function geolocationOptions(lowPower: boolean): PositionOptions {
  return lowPower
    ? { enableHighAccuracy: false, maximumAge: 15_000, timeout: 20_000 }
    : { enableHighAccuracy: true, maximumAge: 2_000, timeout: 15_000 };
}

/** useWeather() polling tuned the same way — fewer conditions refreshes while riding. */
export function weatherPollOptions(lowPower: boolean): {
  minMoveM: number;
  minIntervalMs: number;
  pollMs: number;
} {
  return lowPower
    ? { minMoveM: 8000, minIntervalMs: 20 * 60 * 1000, pollMs: 5 * 60 * 1000 }
    : { minMoveM: 5000, minIntervalMs: 10 * 60 * 1000, pollMs: 60_000 };
}
