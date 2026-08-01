import { describe, expect, it } from "vitest";
import { bearing, bearingDelta, formatDistance, formatDuration, haversine, parseGpx } from "./gpx";

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

function gpxWithSegments(segments: { lat: number; lon: number; ele?: number }[][]): string {
  const trksegs = segments
    .map(
      (points) =>
        `<trkseg>${points
          .map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}">${p.ele != null ? `<ele>${p.ele}</ele>` : ""}</trkpt>`)
          .join("")}</trkseg>`,
    )
    .join("");
  return `<?xml version="1.0"?><gpx><trk><name>Test</name>${trksegs}</trk></gpx>`;
}

describe("haversine / bearing", () => {
  it("computes zero distance for identical points", () => {
    expect(haversine(45, -122, 45, -122)).toBeCloseTo(0, 6);
  });

  it("computes a plausible distance over 1 degree of longitude near the equator", () => {
    const d = haversine(0, 0, 0, 1);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("reports due-east bearing as ~90 degrees", () => {
    const b = bearing(45, -122, 45, -121.999);
    expect(b).toBeGreaterThan(85);
    expect(b).toBeLessThan(95);
  });
});

describe("bearingDelta", () => {
  it("is zero for identical bearings", () => {
    expect(bearingDelta(90, 90)).toBe(0);
  });

  it("is positive for a right turn", () => {
    expect(bearingDelta(0, 90)).toBeCloseTo(90, 6);
  });

  it("is negative for a left turn", () => {
    expect(bearingDelta(90, 0)).toBeCloseTo(-90, 6);
  });

  it("wraps around 180/-180 consistently", () => {
    expect(bearingDelta(10, 200)).toBeCloseTo(-170, 6);
  });
});

describe("parseGpx", () => {
  it("rejects invalid XML", () => {
    expect(() => parseGpx("<gpx><trk><trkseg>", "fallback")).toThrow();
  });

  it("rejects a file with fewer than 2 track points", () => {
    const xml = gpxWithSegments([[offset(0, 0)]]);
    expect(() => parseGpx(xml, "fallback")).toThrow();
  });

  it("parses a simple track and computes distance/ascent/descent", () => {
    const xml = `<?xml version="1.0"?><gpx><trk><name>Loop</name><trkseg>
      <trkpt lat="${offset(0, 0).lat}" lon="${offset(0, 0).lon}"><ele>100</ele></trkpt>
      <trkpt lat="${offset(0, 100).lat}" lon="${offset(0, 100).lon}"><ele>110</ele></trkpt>
      <trkpt lat="${offset(0, 200).lat}" lon="${offset(0, 200).lon}"><ele>105</ele></trkpt>
    </trkseg></trk></gpx>`;

    const parsed = parseGpx(xml, "fallback");
    expect(parsed.name).toBe("Loop");
    expect(parsed.points).toHaveLength(3);
    expect(parsed.distanceM).toBeGreaterThan(190);
    expect(parsed.distanceM).toBeLessThan(210);
    expect(parsed.ascentM).toBeGreaterThan(0);
    expect(parsed.descentM).toBeGreaterThan(0);
    expect(parsed.points[0].gap).toBeFalsy();
  });

  it("falls back to the provided name when the GPX has none", () => {
    const xml = `<?xml version="1.0"?><gpx><trk><trkseg>
      <trkpt lat="${offset(0, 0).lat}" lon="${offset(0, 0).lon}"></trkpt>
      <trkpt lat="${offset(0, 50).lat}" lon="${offset(0, 50).lon}"></trkpt>
    </trkseg></trk></gpx>`;
    expect(parseGpx(xml, "my-route.gpx").name).toBe("my-route.gpx");
  });

  it("marks the first point of a second <trkseg> as a gap, and only that point", () => {
    const seg1 = [offset(0, 0), offset(0, 10), offset(0, 20)];
    const seg2 = [offset(0, 20), offset(0, 30), offset(0, 40)];
    const xml = gpxWithSegments([seg1, seg2]);

    const parsed = parseGpx(xml, "fallback");
    expect(parsed.points).toHaveLength(6);
    const gapIndices = parsed.points.map((p, i) => (p.gap ? i : -1)).filter((i) => i >= 0);
    expect(gapIndices).toEqual([3]);
  });

  it("does not mark any gap for a single-segment track", () => {
    const xml = gpxWithSegments([[offset(0, 0), offset(0, 10), offset(0, 20)]]);
    const parsed = parseGpx(xml, "fallback");
    expect(parsed.points.some((p) => p.gap)).toBe(false);
  });

  it("simplification preserves a sharp corner instead of averaging it away", () => {
    // A long straight run east, a hard turn north for a short spike, then
    // straight east again — enough points to force simplify() to kick in.
    const points: { lat: number; lon: number }[] = [];
    for (let i = 0; i <= 3000; i++) points.push(offset(i * 2, 0));
    const spike = offset(3000 * 2, 80);
    points.push(spike);
    for (let i = 3001; i <= 3200; i++) points.push(offset(i * 2, 0));

    const xml = gpxWithSegments([points]);
    const parsed = parseGpx(xml, "fallback");

    expect(parsed.points.length).toBeLessThanOrEqual(2500);
    const closestToSpike = Math.min(
      ...parsed.points.map((p) => haversine(p.lat, p.lon, spike.lat, spike.lon)),
    );
    // Uniform index-sampling would very likely drop the spike entirely
    // (it's a single point among thousands); RDP should keep it or a
    // near-neighbor since it's the point of maximum deviation from the line.
    expect(closestToSpike).toBeLessThan(5);
  });

  it("simplification never drops a segment's gap marker even when heavily compressed", () => {
    const seg1: { lat: number; lon: number }[] = [];
    for (let i = 0; i <= 2000; i++) seg1.push(offset(i * 2, 0));
    const seg2: { lat: number; lon: number }[] = [];
    for (let i = 0; i <= 2000; i++) seg2.push(offset(i * 2, 500));

    const xml = gpxWithSegments([seg1, seg2]);
    const parsed = parseGpx(xml, "fallback");

    expect(parsed.points.length).toBeLessThanOrEqual(2500);
    expect(parsed.points.some((p) => p.gap)).toBe(true);
  });
});

describe("formatDistance / formatDuration", () => {
  it("formats sub-km distances in meters", () => {
    expect(formatDistance(250)).toBe("250 m");
  });

  it("formats km distances", () => {
    expect(formatDistance(2500)).toBe("2.50 km");
  });

  it("formats durations under an hour in minutes", () => {
    expect(formatDuration(600)).toBe("10 min");
  });

  it("formats durations over an hour as h/m", () => {
    expect(formatDuration(3660)).toBe("1h 01m");
  });
});
