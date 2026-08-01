/**
 * Single guarded service-worker registrar.
 * Never registers in dev, inside an iframe, or when explicitly disabled via
 * the `?sw=off` kill switch (handy for debugging a stuck cache locally).
 */

const SW_URL = "/sw.js";

async function unregisterExisting() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => {
        const url =
          registration.active?.scriptURL ||
          registration.installing?.scriptURL ||
          registration.waiting?.scriptURL ||
          "";
        return url.endsWith(SW_URL);
      })
      .map((registration) => registration.unregister()),
  );
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const inIframe = window.self !== window.top;
  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  const refuse = !import.meta.env.PROD || inIframe || killSwitch;

  if (refuse) {
    void unregisterExisting();
    return;
  }

  navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
    /* offline support is best effort */
  });
}
