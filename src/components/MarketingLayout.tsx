import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HodoraLogo } from "@/components/HodoraLogo";
import { MobileTabBar } from "@/components/MobileTabBar";
import { useUser } from "@/hooks/use-user";
import { useTheme } from "@/lib/theme";

export const GITHUB_URL = "https://github.com/saarth/hodora";
export const ANDROID_RELEASES_URL = `${GITHUB_URL}/releases`;

export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .3.2.66.79.55A10.52 10.52 0 0 0 23.5 12c0-6.27-5.23-11.5-11.5-11.5Z" />
    </svg>
  );
}

export function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18a.42.42 0 00-.15-.57.42.42 0 00-.57.15l-1.86 3.22a11.5 11.5 0 00-9.72 0L5.28 5.88a.42.42 0 00-.57-.15.42.42 0 00-.15.57L6.4 9.48C3.94 11.02 2.28 13.6 2 16.6h20c-.28-3-1.94-5.58-4.4-7.12zM7 14.4a1.2 1.2 0 110-2.4 1.2 1.2 0 010 2.4zm10 0a1.2 1.2 0 110-2.4 1.2 1.2 0 010 2.4z" />
    </svg>
  );
}

function MarketingNav() {
  const { user, loading } = useUser();
  const { theme, toggle } = useTheme();

  return (
    <nav className="flex h-20 items-center justify-between">
      <Link to="/" aria-label="Hodora home">
        <HodoraLogo textClassName="text-xl font-extrabold" />
      </Link>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        {!loading && (
          <Button asChild variant={user ? "default" : "secondary"}>
            <Link to={user ? "/rides" : "/auth"}>{user ? "My rides" : "Sign in"}</Link>
          </Button>
        )}
      </div>
    </nav>
  );
}

/**
 * The indexable topic pages, in one list.
 *
 * Exported because the landing page renders the same set as a visible section:
 * a guide reachable only from a footer is one click deeper than it needs to be,
 * and this way adding a page updates both places at once.
 */
export const GUIDES = [
  { to: "/bike-navigation-app", label: "Bike navigation app" },
  { to: "/turn-by-turn-navigation", label: "Turn-by-turn navigation" },
  { to: "/offline-navigation", label: "Offline navigation" },
  { to: "/bike-computer-alternative", label: "Bike computer alternative" },
  { to: "/gpx-routes", label: "GPX route management" },
  { to: "/elevation-tracking", label: "Elevation tracking" },
  { to: "/club-rides", label: "Navigation for club rides" },
  { to: "/gps-cycling-app", label: "Free GPS app for cycling" },
] as const;

/**
 * Site-wide internal linking, in one place.
 *
 * Every marketing page carries the same footer so the topic pages
 * (`/bike-navigation-app`, `/club-rides`, `/gps-cycling-app`) are reachable in
 * one hop from anywhere — orphan pages that only the sitemap knows about get
 * crawled late and rank badly, however good the copy is.
 */
function MarketingFooter() {
  return (
    <footer className="mt-24 border-t border-border pt-10">
      <div className="grid gap-8 sm:grid-cols-3">
        <div>
          <h2 className="text-sm font-bold">Ride with Hodora</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link to="/rides" className="hover:text-foreground">
                Import a GPX route
              </Link>
            </li>
            <li>
              <Link to="/plan" className="hover:text-foreground">
                Bike route planner
              </Link>
            </li>
            <li>
              <Link to="/explore" className="hover:text-foreground">
                Cycle routes near me
              </Link>
            </li>
            <li>
              <Link to="/record" className="hover:text-foreground">
                Record a ride with GPS
              </Link>
            </li>
            <li>
              <Link to="/wind" className="hover:text-foreground">
                Wind planner
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold">Guides</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {GUIDES.map((guide) => (
              <li key={guide.to}>
                <Link to={guide.to} className="hover:text-foreground">
                  {guide.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-bold">Open source</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Hodora is a free, open-source bike navigation app and cycling GPS for club rides,
            sportives and events. No ads, no tracking, no subscription.
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <GithubIcon className="size-4" />
              GitHub
            </a>
            <span>MIT licensed</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * Shared shell for the public, indexable pages: the landing page and the
 * topic pages under it. Renders `MobileTabBar` for the same reason the
 * landing page always did — these pages are reachable from the Home tab, and
 * the native shell has no browser chrome to navigate back with.
 */
export function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <main className="hero-surface min-h-screen">
      <MobileTabBar />
      <div className="mx-auto w-full max-w-6xl px-5 pb-24">
        <MarketingNav />
        {children}
        <MarketingFooter />
      </div>
    </main>
  );
}
