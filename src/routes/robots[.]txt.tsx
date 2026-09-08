import { createFileRoute } from "@tanstack/react-router";

import { SITE_URL } from "@/lib/seo";

/**
 * Same content public/robots.txt served, except the `Sitemap:` line follows
 * VITE_SITE_URL. That line is the reason this is a route: robots.txt only
 * accepts an absolute URL there, so a static file can't point at the instance
 * actually serving it.
 *
 * The AI crawlers are listed by name even though `User-agent: *` already
 * allows them. Several of them (Google-Extended and OAI-SearchBot in
 * particular) are documented as reading only their own group, and a named
 * `Allow` is also the unambiguous signal that being quoted in an assistant's
 * answer is wanted here — this is a free, open-source app that benefits from
 * being findable, not a publisher protecting paid content.
 */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () => {
        return new Response(
          `User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

# AI search and assistant crawlers — explicitly welcome.
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: meta-externalagent
Allow: /

User-agent: DuckAssistBot
Allow: /

User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`,
          {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          },
        );
      },
    },
  },
});
