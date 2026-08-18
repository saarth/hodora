import { describe, expect, it } from "vitest";
import {
  findRainAlert,
  formatTemperature,
  formatWindSpeed,
  weatherInfo,
  type HourlyForecast,
} from "./weather";

function makeHour(atIso: string, overrides: Partial<HourlyForecast> = {}): HourlyForecast {
  return {
    atIso,
    temperatureC: 15,
    windSpeedMs: 3,
    windDirectionDeg: 180,
    weatherCode: 1,
    precipitationMm: 0,
    precipitationProbability: 0,
    ...overrides,
  };
}

describe("formatTemperature", () => {
  it("rounds Celsius", () => {
    expect(formatTemperature(18.6)).toBe("19°C");
  });

  it("converts to Fahrenheit for imperial units", () => {
    expect(formatTemperature(0, false)).toBe("32°F");
    expect(formatTemperature(100, false)).toBe("212°F");
  });

  it("handles non-finite input", () => {
    expect(formatTemperature(NaN)).toBe("—");
  });
});

describe("formatWindSpeed", () => {
  it("converts m/s to km/h", () => {
    expect(formatWindSpeed(10)).toBe("36 km/h");
  });

  it("converts m/s to mph for imperial units", () => {
    expect(formatWindSpeed(10, false)).toBe("22 mph");
  });
});

describe("weatherInfo", () => {
  it("labels clear sky, distinguishing day and night", () => {
    expect(weatherInfo(0, true)).toEqual({ label: "Clear sky", icon: "sun" });
    expect(weatherInfo(0, false)).toEqual({ label: "Clear sky", icon: "moon" });
  });

  it("labels rain and thunderstorm codes", () => {
    expect(weatherInfo(63)).toEqual({ label: "Rain", icon: "cloud-rain" });
    expect(weatherInfo(95)).toEqual({ label: "Thunderstorm", icon: "cloud-lightning" });
  });

  it("falls back gracefully for unknown codes", () => {
    expect(weatherInfo(1234)).toEqual({ label: "Weather", icon: "cloud" });
  });
});

describe("findRainAlert", () => {
  const now = Date.parse("2026-08-18T12:00");

  it("returns null when nothing crosses the rain thresholds", () => {
    const hourly = [makeHour("2026-08-18T12:00"), makeHour("2026-08-18T13:00")];
    expect(findRainAlert(hourly, now, new Set())).toBeNull();
  });

  it("finds the nearest upcoming hour with meaningful rain", () => {
    const hourly = [
      makeHour("2026-08-18T12:00"),
      makeHour("2026-08-18T13:00", { precipitationProbability: 80, precipitationMm: 1.2 }),
    ];
    const alert = findRainAlert(hourly, now, new Set());
    expect(alert).not.toBeNull();
    expect(alert?.key).toBe("2026-08-18T13:00");
    expect(alert?.minutesAway).toBe(60);
  });

  it("doesn't fire a slot already in the alerted set", () => {
    const hourly = [makeHour("2026-08-18T13:00", { precipitationProbability: 80 })];
    expect(findRainAlert(hourly, now, new Set(["2026-08-18T13:00"]))).toBeNull();
  });

  it("ignores a rainy hour outside the lookahead window", () => {
    const hourly = [makeHour("2026-08-18T15:00", { precipitationProbability: 90 })];
    expect(findRainAlert(hourly, now, new Set(), { withinMinutes: 60 })).toBeNull();
  });

  it("still fires for rain that's already started (small negative slack)", () => {
    const hourly = [makeHour("2026-08-18T11:55", { precipitationMm: 2 })];
    const alert = findRainAlert(hourly, now, new Set());
    expect(alert).not.toBeNull();
    expect(alert?.minutesAway).toBe(0);
  });
});
