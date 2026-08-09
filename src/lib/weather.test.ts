import { describe, expect, it } from "vitest";
import { formatTemperature, formatWindSpeed, weatherInfo } from "./weather";

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
