/**
 * Screen wake lock, driven by the page's visibility.
 *
 * The Wake Lock API hands back a sentinel that the browser releases on its own
 * whenever the page is backgrounded — switching apps mid-ride, or the screen
 * blanking once. Nothing reacquires it when the page comes back, so the lock
 * has to be re-requested on every return to the foreground.
 *
 * Kept out of the hook so it can be tested without a React renderer.
 */
export function startWakeLock(): () => void {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return () => {};

  let sentinel: WakeLockSentinel | null = null;
  let acquiring = false;
  let stopped = false;

  const held = () => sentinel !== null && !sentinel.released;

  const acquire = async () => {
    // Bail if a lock is already held, or a request is still in flight — the
    // visibility handler can fire again before the first request settles, and
    // a second sentinel would leak (releasing only the one we kept).
    if (stopped || acquiring || held()) return;
    acquiring = true;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (stopped) {
        void lock.release();
        return;
      }
      // The browser's own release leaves our reference dangling, and a stale
      // non-null sentinel would make the next foreground look like the lock
      // was still held. Drop it as soon as the sentinel reports itself gone.
      lock.addEventListener("release", () => {
        if (sentinel === lock) sentinel = null;
      });
      sentinel = lock;
    } catch {
      /* denied or unsupported in this context — the ride still records without it */
    } finally {
      acquiring = false;
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void acquire();
  };

  void acquire();
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    void sentinel?.release();
    sentinel = null;
  };
}
