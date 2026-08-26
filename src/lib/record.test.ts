import { describe, expect, it } from "vitest";
import { acceptRecordingFix } from "./record";

const BASE_LAT = 45;
const BASE_LON = -122;
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((BASE_LAT * Math.PI) / 180);

function offset(eastM: number, northM: number) {
  return {
    lat: BASE_LAT + northM / M_PER_DEG_LAT,
    lon: BASE_LON + eastM / M_PER_DEG_LON,
  };
}

describe("acceptRecordingFix", () => {
  it("always accepts the first fix", () => {
    const points = acceptRecordingFix([], { lat: BASE_LAT, lon: BASE_LON, ele: 100, tSec: 0 });
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ lat: BASE_LAT, lon: BASE_LON, ele: 100, t: 0, gap: false });
  });

  it("defaults a missing altitude to 0", () => {
    const points = acceptRecordingFix([], { lat: BASE_LAT, lon: BASE_LON, ele: null, tSec: 0 });
    expect(points[0].ele).toBe(0);
  });

  it("rejects a fix that hasn't moved far enough (GPS jitter while stationary)", () => {
    const first = acceptRecordingFix([], { lat: BASE_LAT, lon: BASE_LON, ele: 0, tSec: 0 });
    const jittered = offset(1, 1); // ~1.4m away, under the 3m threshold
    const second = acceptRecordingFix(first, { ...jittered, ele: 0, tSec: 5 });
    expect(second).toBe(first);
    expect(second).toHaveLength(1);
  });

  it("accepts a fix once real movement crosses the threshold", () => {
    const first = acceptRecordingFix([], { lat: BASE_LAT, lon: BASE_LON, ele: 0, tSec: 0 });
    const moved = offset(0, 10); // 10m north
    const second = acceptRecordingFix(first, { ...moved, ele: 0, tSec: 5 });
    expect(second).toHaveLength(2);
    expect(second).not.toBe(first);
  });
});
