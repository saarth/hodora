import { createFileRoute } from "@tanstack/react-router";
import { getRequest } from "@tanstack/react-start/server";

import { originFromRequest } from "@/lib/seo";

/**
 * Generated rather than static (`public/robots.txt`) so the `Sitemap:` line can
 * carry an absolute URL — the one thing robots.txt won't accept as a relative
 * path — on a deployment whose domain isn't known until a request arrives.
 */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        const origin = originFromRequest(getRequest());

        const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /rides
Disallow: /auth
Disallow: /oauth-callback
Disallow: /reset-password
Disallow: /settings
${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ""}`;

        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
