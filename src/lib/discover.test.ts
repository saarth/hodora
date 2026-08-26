import { describe, expect, it } from "vitest";
import { toRidePoints } from "./discover";

// The two rides in production that broke a strict JSON decoder were saved
// from /explore, whose points carried the raw distance accumulator (e.g.
// "d": 9.109941619688309). RidePoint documents `d` as whole meters and the
// GPX pipeline has always rounded it, so /explore and /plan must too.
describe("toRidePoints", () => {
  const path = [
    { lat: 52.619383, lon: 4.6499337 },
    { lat: 52.619365, lon: 4.6499302, ele: 3.14159 },
    { lat: 52.618, lon: 4.6512, ele: 12.06 },
  ];

  it("stores d as whole meters and ele to one decimal", () => {
    const points = toRidePoints(path);

    expect(points.every((p) => Number.isInteger(p.d))).toBe(true);
    expect(points[1].ele).toBe(3.1);
    expect(points[2].ele).toBe(12.1);
  });

  it("starts at zero and accumulates distance monotonically", () => {
    const points = toRidePoints(path);

    expect(points[0].d).toBe(0);
    expect(points[0].ele).toBe(0); // Overpass routes carry no elevation at all
    expect(points[1].d).toBeGreaterThan(0);
    expect(points[2].d).toBeGreaterThan(points[1].d);
  });

  it("rounds only on output, so error can't compound along the path", () => {
    // 400 hops of ~0.55 m each: rounding every hop would floor them all to 0
    // and lose the route's length entirely.
    const drift = Array.from({ length: 400 }, (_, i) => ({
      lat: 52 + i * 0.000005,
      lon: 4.65,
    }));

    const points = toRidePoints(drift);

    expect(points[points.length - 1].d).toBeGreaterThan(200);
  });
});
