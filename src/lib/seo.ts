/**
 * The one place that knows what URL this deployment is served at.
 *
 * Canonical tags, `og:url`, the JSON-LD `url`, the social image URLs and the
 * sitemap all have to be absolute, and they all have to agree with each other
 * — a page whose canonical points at one domain while the sitemap lists
 * another is a mixed signal that gets it dropped from the index. They used to
 * be hardcoded to `https://hodora.app` across seven files, which meant a
 * self-hosted instance told Google that hodora.app was the canonical home of
 * *its* pages, so the self-hoster's own site could never be indexed.
 *
 * The default is the official deployment, so nothing changes for hodora.app if
 * the variable is unset. Mirrors the pattern capacitor.config.ts already uses
 * for CAPACITOR_SERVER_URL.
 */

const DEFAULT_SITE_URL = "https://hodora.app";

/**
 * Deliberately not derived from the request's Host header. The value is needed
 * on the client too (route `head()` runs on navigation, where no request
 * exists), so a request-derived origin could only ever apply to some of the
 * URLs above — which is exactly the disagreement this module exists to avoid.
 */
export const SITE_URL = normalizeOrigin(import.meta.env.VITE_SITE_URL) || DEFAULT_SITE_URL;

/** Trailing slashes break canonical comparisons — strip them once, here. */
function normalizeOrigin(value: string | undefined): string {
  return value ? value.trim().replace(/\/+$/, "") : "";
}

/** `/plan` -> `https://hodora.app/plan`. Pass "/" for the site root. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Convenience for a route's `head().links` — canonical is always absolute. */
export function canonicalLink(path: string) {
  return [{ rel: "canonical", href: absoluteUrl(path) }];
}
