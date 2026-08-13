import { describe, expect, it } from "vitest";
import { weeklyStats } from "./stats";

// A fixed Wednesday, so "this week" always starts on the Monday two days before.
const NOW = new Date("2026-08-12T10:00:00Z");

describe("weeklyStats", () => {
  it("returns `weeks` continuous buckets even with no sessions", () => {
    const result = weeklyStats([], 4, NOW);
    expect(result.map((b) => b.weekStart)).toEqual([
      "2026-07-20",
      "2026-07-27",
      "2026-08-03",
      "2026-08-10",
    ]);
    expect(result.every((b) => b.distanceM === 0 && b.rideCount === 0)).toBe(true);
  });

  it("sums distance/ascent/count of sessions within the same week", () => {
    const sessions = [
      { started_at: "2026-08-10T09:00:00Z", distance_m: 10_000, ascent_m: 100 },
      { started_at: "2026-08-12T09:00:00Z", distance_m: 5_000, ascent_m: 50 },
    ];
    const result = weeklyStats(sessions, 2, NOW);
    const thisWeek = result[result.length - 1];
    expect(thisWeek.weekStart).toBe("2026-08-10");
    expect(thisWeek.distanceM).toBe(15_000);
    expect(thisWeek.ascentM).toBe(150);
    expect(thisWeek.rideCount).toBe(2);
  });

  it("drops sessions outside the requested window", () => {
    const sessions = [{ started_at: "2020-01-01T00:00:00Z", distance_m: 1000, ascent_m: 10 }];
    const result = weeklyStats(sessions, 2, NOW);
    expect(result.reduce((sum, b) => sum + b.distanceM, 0)).toBe(0);
  });

  it("attributes a Sunday ride to the week that started the previous Monday", () => {
    const sessions = [{ started_at: "2026-08-09T12:00:00Z", distance_m: 1000, ascent_m: 10 }];
    const result = weeklyStats(sessions, 3, NOW);
    const bucket = result.find((b) => b.weekStart === "2026-08-03");
    expect(bucket?.distanceM).toBe(1000);
  });
});
