/**
 * Canonical URL and meta-tag helpers.
 *
 * Hodora is self-hostable, so there is no single hardcoded domain. Set
 * `VITE_SITE_URL` (e.g. `https://hodora.example.com`) on the deployment that
 * should own the URLs Google indexes — that's what canonical tags, `og:url`
 * and absolute image URLs are built from. Leave it unset and we fall back to
 * relative URLs and skip the canonical tag, which is correct-but-weaker
 * behaviour rather than a wrong absolute URL pointing at someone else's host.
 *
 * Server routes that need an origin at request time (sitemap.xml, robots.txt)
 * use `originFromRequest` instead, so they work even when the env var is
 * missing.
 */

export const SITE_URL = normalizeOrigin(import.meta.env.VITE_SITE_URL);

export const SITE_NAME = "Hodora";

/**
 * Site-wide fallback title and description. Both lead with the words people
 * actually search for ("GPX", "bike route", "navigation") rather than the
 * brand name alone, which nobody searches for until they already know it.
 * Keep the title under ~60 characters and the description under ~155 so
 * neither gets truncated in results.
 */
export const DEFAULT_TITLE = "Hodora — GPX bike route planner and navigation app";

export const DEFAULT_DESCRIPTION =
  "Free, open-source GPX app for cyclists. Import or plan a bike route, see the climbing, then ride it with offline maps and turn-by-turn navigation.";

/** Trailing slashes break canonical comparisons — strip them once, here. */
function normalizeOrigin(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/\/+$/, "");
}

/** `/explore` -> `https://hodora.example.com/explore` (or `/explore` if unset). */
export function absoluteUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return SITE_URL ? `${SITE_URL}${suffix}` : suffix;
}

/**
 * Best-effort origin for a live request. Prefers the configured site URL so a
 * deployment behind a tunnel or proxy still advertises its public name, then
 * falls back to the forwarded/Host headers.
 */
export function originFromRequest(request: Request): string {
  if (SITE_URL) return SITE_URL;
  const headers = request.headers;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return "";
  const proto =
    headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

type SeoInput = {
  title: string;
  description: string;
  /** Route path this page canonically lives at, e.g. "/" or "/explore". */
  path: string;
  /** Absolute-from-root path to the social preview image. */
  image?: string;
  /** Set for pages that are user-specific or otherwise not worth indexing. */
  noindex?: boolean;
};

/**
 * One place that builds the full title/description/OpenGraph/Twitter set, so
 * the three copies of every string can't drift apart the way they used to.
 */
export function seoMeta({
  title,
  description,
  path,
  image = "/og-image.png",
  noindex = false,
}: SeoInput) {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);

  return [
    { title },
    { name: "description", content: description },
    {
      name: "robots",
      content: noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large",
    },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:image", content: imageUrl },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
  ];
}

/** Canonical link for a page, omitted entirely when no site URL is configured. */
export function canonicalLink(path: string) {
  return SITE_URL ? [{ rel: "canonical", href: absoluteUrl(path) }] : [];
}
