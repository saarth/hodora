import { useEffect } from "react";

import { startWakeLock } from "@/lib/wake-lock";

/**
 * Keeps the screen awake while `active` is true (e.g. during live navigation
 * or while recording a ride), reacquiring the lock each time the page returns
 * to the foreground.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return startWakeLock();
  }, [active]);
}
