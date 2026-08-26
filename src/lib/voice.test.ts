import { describe, expect, it } from "vitest";
import { nextTurnAnnouncement, speakableDistance } from "./voice";

describe("nextTurnAnnouncement", () => {
  it("returns null when nothing has been crossed yet", () => {
    expect(nextTurnAnnouncement(0, 500, new Set())).toBeNull();
  });

  it("fires the 300m threshold first, then not again once announced", () => {
    const announced = new Set<string>();
    const first = nextTurnAnnouncement(0, 280, announced);
    expect(first).toEqual({ key: "0:300", thresholdM: 300 });
    announced.add(first!.key);
    expect(nextTurnAnnouncement(0, 250, announced)).toBeNull();
  });

  it("fires 100m and then 30m as the rider gets closer, without re-firing 300m", () => {
    const announced = new Set<string>(["0:300"]);
    const at100 = nextTurnAnnouncement(0, 90, announced);
    expect(at100).toEqual({ key: "0:100", thresholdM: 100 });
    announced.add(at100!.key);

    const at30 = nextTurnAnnouncement(0, 25, announced);
    expect(at30).toEqual({ key: "0:30", thresholdM: 30 });
  });

  it("treats a new turn index as fresh even if the same thresholds were already announced", () => {
    const announced = new Set<string>(["0:300", "0:100", "0:30"]);
    expect(nextTurnAnnouncement(1, 280, announced)).toEqual({ key: "1:300", thresholdM: 300 });
  });
});

describe("speakableDistance", () => {
  it("renders meters directly in metric", () => {
    expect(speakableDistance(300, true)).toBe("300 meters");
  });

  it("converts to feet, rounded to the nearest 10, in imperial", () => {
    expect(speakableDistance(30, false)).toBe("100 feet");
  });
});
