import { describe, expect, it } from "vitest";
import type { RidePoint } from "./gpx";
import { buildWindSegments, scoreRoute, windSegmentsToGeoJSON } from "./windScore";

const BASE_LAT = 45;
const BASE_LON = -122;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((BASE_LAT * Math.PI) / 180);

/** Offsets a base coordinate by (east, north) meters — good enough for small local test fixtures. */
function offset(eastM: number, northM: number) {
  return {
    lat: BASE_LAT + northM / M_PER_DEG_LAT,
    lon: BASE_LON + eastM / M_PER_DEG_LON,
  };
}

/** A straight route heading due north, `count` points spaced `step` meters apart. */
function northRoute(count = 20, step = 50): RidePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    ...offset(0, i * step),
    ele: 0,
    d: i * step,
  }));
}

describe("scoreRoute", () => {
  const points = northRoute();

  it("saturates to 0 for a pure headwind at the reference speed (wind from the north, riding north)", () => {
    const result = scoreRoute(points, { windSpeedMs: 8, windDirectionDeg: 0 });
    expect(result).not.toBeNull();
    expect(result!.headwindPct).toBe(100);
    expect(result!.tailwindPct).toBe(0);
    expect(result!.windScore).toBe(0);
  });

  it("saturates to 100 for a pure tailwind at the reference speed (wind from the south, riding north)", () => {
    const result = scoreRoute(points, { windSpeedMs: 8, windDirectionDeg: 180 });
    expect(result).not.toBeNull();
    expect(result!.tailwindPct).toBe(100);
    expect(result!.headwindPct).toBe(0);
    expect(result!.windScore).toBe(100);
  });

  it("scores a pure crosswind (wind from the east) as neutral", () => {
    const result = scoreRoute(points, { windSpeedMs: 8, windDirectionDeg: 90 });
    expect(result).not.toBeNull();
    expect(result!.crosswindPct).toBe(100);
    expect(result!.windScore).toBe(50);
  });

  it("scores calm wind as neutral regardless of direction", () => {
    const result = scoreRoute(points, { windSpeedMs: 0, windDirectionDeg: 45 });
    expect(result?.windScore).toBe(50);
  });

  it("returns null for a route too short to segment", () => {
    expect(scoreRoute([points[0]], { windSpeedMs: 5, windDirectionDeg: 0 })).toBeNull();
  });
});

describe("buildWindSegments", () => {
  it("breaks a segment at a gap boundary instead of bridging across it", () => {
    const withGap: RidePoint[] = [
      ...northRoute(5, 50),
      { ...offset(0, 300), ele: 0, d: 300, gap: true },
      { ...offset(0, 350), ele: 0, d: 350 },
    ];
    // A 500m chunk would normally span the whole 350m route in one segment;
    // the gap must force an early break instead.
    const segments = buildWindSegments(withGap, { windSpeedMs: 5, windDirectionDeg: 0 }, 500);
    expect(segments).toHaveLength(2);
    expect(withGap[segments[0].endIndex].gap).toBe(true);
    expect(withGap[segments[1].startIndex].gap).toBe(true);
  });
});

describe("windSegmentsToGeoJSON", () => {
  it("turns segments into LineString features carrying the wind effect", () => {
    const points = northRoute();
    const segments = buildWindSegments(points, { windSpeedMs: 8, windDirectionDeg: 180 });
    const geojson = windSegmentsToGeoJSON(points, segments);
    expect(geojson.features).toHaveLength(segments.length);
    expect(geojson.features.every((f) => f.properties.effect === "tailwind")).toBe(true);
    expect(geojson.features[0]?.geometry.type).toBe("LineString");
  });
});
