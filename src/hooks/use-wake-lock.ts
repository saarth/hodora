import { useEffect } from "react";

/**
 * Keeps the screen awake while `active` is true (e.g. during live navigation).
 * The Wake Lock API releases itself whenever the tab is backgrounded, so this
 * re-acquires on `visibilitychange` once the tab is foregrounded again.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        /* denied or unsupported in this context — navigation still works without it */
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && !sentinel) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release();
    };
  }, [active]);
}
