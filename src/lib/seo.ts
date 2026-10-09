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

/**
 * Structured data helpers.
 *
 * Search engines and LLM crawlers both read JSON-LD, and both punish
 * disagreement between it and the visible page — so every helper here takes
 * the *same* strings the component renders rather than a parallel copy. Pass
 * the array you map over into the FAQ list, not a hand-maintained duplicate.
 *
 * Each returns the graph object, which a route wraps in the meta entry itself:
 *
 * ```ts
 * meta: [{ "script:ld+json": faqJsonLd(FAQS) }]
 * ```
 *
 * The wrapper stays at the call site because TanStack's React binding types
 * `head().meta` entries as React's own `<meta>` props; the `script:ld+json`
 * form only typechecks as a literal written inline in that array.
 */

export type FaqItem = { question: string; answer: string };

/** `FAQPage` for a route's `head().meta`. Feed it the rendered Q&A array. */
export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

/**
 * `BreadcrumbList` so the SERP shows "hodora.app › Bike navigation app"
 * instead of a bare URL. `trail` is ordered root-first and excludes the home
 * page, which this adds itself.
 */
export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "Home", path: "/" }, ...trail].map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/**
 * `Organization` for the site root.
 *
 * Says "Hodora is the thing that publishes this site", which is what lets a
 * search engine or an LLM attach the name to an entity rather than treating it
 * as a word in a sentence.
 *
 * There is deliberately no `SoftwareApplication` graph alongside it. Google's
 * Software App rich result requires `aggregateRating` or `review`, and
 * Search Console flags every page carrying one without them as invalid.
 * Hodora has no genuine user ratings to put there, and made-up ones violate
 * Google's structured-data policy (and risk a manual action), so the "free,
 * open source" facts live in this description and the visible page copy
 * instead. If real ratings ever exist (e.g. a Play Store listing), a
 * `SoftwareApplication` with an `aggregateRating` sourced from them can come
 * back.
 *
 * `logo` points at the PWA icon rather than a marketing image: it has to be a
 * square raster the crawler can actually fetch, and that file already exists
 * and is already cached.
 */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Hodora",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon-512.png"),
    description:
      "Hodora is a free, open-source bike navigation app: GPX import, route planning and offline turn-by-turn cycling directions on the phone you already own.",
    sameAs: ["https://github.com/saarth/hodora"],
  };
}
