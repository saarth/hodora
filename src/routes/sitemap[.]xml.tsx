import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

import { originFromRequest } from "@/lib/seo";

/**
 * Only public, indexable pages belong here. Everything under /rides, /auth and
 * /api is either signed-in-only or a redirect step — those are marked
 * `noindex` on the route itself and disallowed in robots.txt.
 */
const PAGES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/explore", changefreq: "weekly", priority: "0.8" },
];

/**
 * Served from a route rather than `public/sitemap.xml` because the URLs have to
 * be absolute, and Hodora is self-hosted — the domain isn't known at build
 * time. `originFromRequest` uses VITE_SITE_URL when it's set and falls back to
 * the request's own host.
 */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const origin = originFromRequest(getRequest());
        const lastmod = new Date().toISOString().slice(0, 10);

        const urls = PAGES.map(
          ({ path, changefreq, priority }) => `  <url>
    <loc>${origin}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`,
        ).join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

        return new Response(xml, {
          status: 200,
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
