import { createFileRoute } from "@tanstack/react-router";

import { SITE_URL } from "@/lib/seo";

/**
 * The public, indexable routes. Account-gated and per-user routes (/auth,
 * /rides, /share/$id) are marked `noindex` in their own head() and
 * deliberately absent here.
 *
 * `lastmod` is a fixed date per page rather than "today": a date that advances
 * on every request tells crawlers the content changed when it didn't. Bump a
 * page's date by hand when you actually rewrite its content.
 */
const PAGES = [
  { path: "/", lastmod: "2026-09-08", changefreq: "weekly", priority: "1.0" },
  { path: "/bike-navigation-app", lastmod: "2026-09-08", changefreq: "monthly", priority: "0.9" },
  { path: "/club-rides", lastmod: "2026-09-08", changefreq: "monthly", priority: "0.9" },
  { path: "/gps-cycling-app", lastmod: "2026-09-08", changefreq: "monthly", priority: "0.9" },
  {
    path: "/turn-by-turn-navigation",
    lastmod: "2026-09-08",
    changefreq: "monthly",
    priority: "0.9",
  },
  { path: "/offline-navigation", lastmod: "2026-09-08", changefreq: "monthly", priority: "0.9" },
  {
    path: "/bike-computer-alternative",
    lastmod: "2026-09-08",
    changefreq: "monthly",
    priority: "0.9",
  },
  { path: "/gpx-routes", lastmod: "2026-09-08", changefreq: "monthly", priority: "0.9" },
  { path: "/elevation-tracking", lastmod: "2026-09-08", changefreq: "monthly", priority: "0.9" },
  { path: "/plan", lastmod: "2026-08-18", changefreq: "monthly", priority: "0.8" },
  { path: "/explore", lastmod: "2026-08-18", changefreq: "monthly", priority: "0.8" },
  { path: "/wind", lastmod: "2026-08-18", changefreq: "monthly", priority: "0.5" },
];

/**
 * A route rather than a file in public/ so the URLs follow VITE_SITE_URL — a
 * self-hosted instance serving a sitemap full of hodora.app links is telling
 * Google to index someone else's site instead of its own.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const urls = PAGES.map(
          ({ path, lastmod, changefreq, priority }) => `  <url>
    <loc>${SITE_URL}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
        ).join("\n");

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
          {
            status: 200,
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          },
        );
      },
    },
  },
});
