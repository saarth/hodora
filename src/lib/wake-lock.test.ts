import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startWakeLock } from "./wake-lock";

/** Stand-in for the sentinel the browser hands back, with its release event. */
class FakeSentinel extends EventTarget {
  released = false;

  release = vi.fn(async () => {
    this.releaseFromBrowser();
  });

  /** What the browser does on its own when the page is backgrounded. */
  releaseFromBrowser() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event("release"));
  }
}

let sentinels: FakeSentinel[] = [];
let request: ReturnType<typeof vi.fn>;
let visibility: DocumentVisibilityState;

/** Drives the visibility transition the browser reports on app switch. */
function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  sentinels = [];
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  request = vi.fn(async () => {
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    return sentinel as unknown as WakeLockSentinel;
  });
  Object.defineProperty(navigator, "wakeLock", {
    value: { request },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("startWakeLock", () => {
  it("acquires a screen lock immediately", async () => {
    const stop = startWakeLock();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));
    expect(request).toHaveBeenCalledWith("screen");
    stop();
  });

  it("reacquires after the browser releases the lock on backgrounding", async () => {
    const stop = startWakeLock();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));

    // Minimising the app: the browser drops the lock, then the page hides.
    sentinels[0].releaseFromBrowser();
    setVisibility("hidden");

    // Reopening it must take a fresh lock — the released one is dead.
    setVisibility("visible");
    await vi.waitFor(() => expect(sentinels).toHaveLength(2));
    expect(sentinels[1].released).toBe(false);

    stop();
  });

  it("survives repeated background/foreground cycles", async () => {
    const stop = startWakeLock();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));

    for (let cycle = 1; cycle <= 3; cycle++) {
      sentinels.at(-1)!.releaseFromBrowser();
      setVisibility("hidden");
      setVisibility("visible");
      await vi.waitFor(() => expect(sentinels).toHaveLength(cycle + 1));
    }

    expect(sentinels.at(-1)!.released).toBe(false);
    stop();
  });

  it("does not stack locks when the page is already holding one", async () => {
    const stop = startWakeLock();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));

    // A visibilitychange that isn't preceded by a release (e.g. the page was
    // never actually backgrounded) must not request a second sentinel.
    setVisibility("visible");
    setVisibility("visible");
    await Promise.resolve();
    expect(sentinels).toHaveLength(1);

    stop();
  });

  it("does not stack locks when a request is still in flight", async () => {
    let settle: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      settle = resolve;
    });
    request.mockImplementation(async () => {
      await gate;
      const sentinel = new FakeSentinel();
      sentinels.push(sentinel);
      return sentinel as unknown as WakeLockSentinel;
    });

    const stop = startWakeLock();
    setVisibility("visible");
    setVisibility("visible");
    settle!();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));
    expect(request).toHaveBeenCalledTimes(1);

    stop();
  });

  it("releases the lock when stopped", async () => {
    const stop = startWakeLock();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));

    stop();
    expect(sentinels[0].release).toHaveBeenCalled();

    // And stops reacquiring once torn down.
    setVisibility("hidden");
    setVisibility("visible");
    await Promise.resolve();
    expect(sentinels).toHaveLength(1);
  });

  it("releases a lock that arrives after being stopped", async () => {
    let settle: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      settle = resolve;
    });
    request.mockImplementation(async () => {
      await gate;
      const sentinel = new FakeSentinel();
      sentinels.push(sentinel);
      return sentinel as unknown as WakeLockSentinel;
    });

    const stop = startWakeLock();
    stop();
    settle!();
    await vi.waitFor(() => expect(sentinels).toHaveLength(1));
    await vi.waitFor(() => expect(sentinels[0].release).toHaveBeenCalled());
  });

  it("is inert where the API is unsupported", () => {
    Reflect.deleteProperty(navigator, "wakeLock");
    expect(() => startWakeLock()()).not.toThrow();
  });

  it("survives a denied request", async () => {
    request.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const stop = startWakeLock();
    await Promise.resolve();
    expect(() => stop()).not.toThrow();
  });
});
