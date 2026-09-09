import { describe, expect, it } from "vitest";
import { boundsAround, boundsContain, POI_CATEGORIES, POI_COLOR_VAR } from "./poi";

describe("boundsAround", () => {
  it("turns a radius in meters into a box around the center", () => {
    const bounds = boundsAround({ lat: 0, lon: 0 }, 111_320);
    expect(bounds.maxLat - bounds.minLat).toBeCloseTo(2, 3);
    // On the equator a degree of longitude is the same length as a degree of
    // latitude, so the box is square there.
    expect(bounds.maxLon - bounds.minLon).toBeCloseTo(2, 3);
  });

  it("widens the box in longitude as meridians converge", () => {
    const equator = boundsAround({ lat: 0, lon: 0 }, 10_000);
    const north = boundsAround({ lat: 60, lon: 0 }, 10_000);
    expect(north.maxLat - north.minLat).toBeCloseTo(equator.maxLat - equator.minLat, 6);
    // cos(60°) = 0.5, so the same distance east/west spans twice the longitude.
    expect(north.maxLon - north.minLon).toBeCloseTo((equator.maxLon - equator.minLon) * 2, 4);
  });

  it("clamps near the poles so the box stays a box", () => {
    const bounds = boundsAround({ lat: 89.999, lon: 0 }, 10_000);
    expect(Number.isFinite(bounds.maxLon - bounds.minLon)).toBe(true);
    expect(bounds.maxLon - bounds.minLon).toBeLessThan(10);
  });
});

describe("boundsContain", () => {
  const bounds = { minLat: 52, maxLat: 53, minLon: 4, maxLon: 5 };

  it("accepts a point inside, including on the edge", () => {
    expect(boundsContain(bounds, { lat: 52.4, lon: 4.9 })).toBe(true);
    expect(boundsContain(bounds, { lat: 52, lon: 4 })).toBe(true);
  });

  it("rejects a point outside in either axis", () => {
    expect(boundsContain(bounds, { lat: 51.9, lon: 4.9 })).toBe(false);
    expect(boundsContain(bounds, { lat: 52.4, lon: 5.1 })).toBe(false);
  });
});

describe("POI categories", () => {
  it("gives every category a color, so no pin falls back to the muted default", () => {
    for (const category of POI_CATEGORIES) {
      expect(POI_COLOR_VAR[category.value]).toMatch(/^--color-/);
    }
  });
});
