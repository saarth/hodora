import { useEffect, type ReactNode } from "react";

import { HodoraLogo } from "@/components/HodoraLogo";

/**
 * The branded full-screen dead end: 404, a crashed route, a ride that isn't
 * there. One component so every one of them looks like Hodora rather than
 * like the framework's default — same parchment/racing-green surface, same
 * display type, same rust accent as the rest of the site.
 *
 * Actions are passed in rather than baked in because the right escape hatch
 * differs: a 404 can navigate client-side, while a route that just threw
 * wants a hard reload that rebuilds the app from scratch.
 */
export function StatusPage({
  code,
  title,
  message,
  actions,
  documentTitle,
}: {
  /** The small eyebrow above the heading — "404 — wrong turn", "Offline". */
  code?: string;
  title: string;
  message: ReactNode;
  actions?: ReactNode;
  /**
   * Browser-tab title. Set in an effect rather than a route `head()` because
   * these render from `notFoundComponent`/`errorComponent`, which sit outside
   * the head-managed route match and inherit the generic root title
   * otherwise. The 404 *status code* is what crawlers act on and Start
   * already sends that correctly; this is for the tab and history entry.
   */
  documentTitle?: string;
}) {
  useEffect(() => {
    if (documentTitle) document.title = documentTitle;
  }, [documentTitle]);

  return (
    <main className="hero-surface flex min-h-screen flex-col px-5 pb-16">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
        <div className="flex h-20 items-center">
          <a href="/" aria-label="Hodora home">
            <HodoraLogo textClassName="text-xl font-extrabold" />
          </a>
        </div>

        <div className="flex flex-1 flex-col justify-center py-12">
          {code && <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">{code}</p>}
          <h1 className="mt-5 max-w-2xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
            {title}
          </h1>
          <div className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
            {message}
          </div>
          {actions && <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>}
        </div>
      </div>
    </main>
  );
}
