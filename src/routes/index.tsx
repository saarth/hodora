import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Mountain, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { useTheme } from "@/lib/theme";
import { HodoraLogo } from "@/components/HodoraLogo";
import { Moon, Sun } from "lucide-react";

const GITHUB_URL = "https://github.com/saarth/hodora";
const ANDROID_RELEASES_URL = `${GITHUB_URL}/releases`;

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .3.2.66.79.55A10.52 10.52 0 0 0 23.5 12c0-6.27-5.23-11.5-11.5-11.5Z" />
    </svg>
  );
}

function AndroidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18a.42.42 0 00-.15-.57.42.42 0 00-.57.15l-1.86 3.22a11.5 11.5 0 00-9.72 0L5.28 5.88a.42.42 0 00-.57-.15.42.42 0 00-.15.57L6.4 9.48C3.94 11.02 2.28 13.6 2 16.6h20c-.28-3-1.94-5.58-4.4-7.12zM7 14.4a1.2 1.2 0 110-2.4 1.2 1.2 0 010 2.4zm10 0a1.2 1.2 0 110-2.4 1.2 1.2 0 010 2.4z" />
    </svg>
  );
}

const TITLE = "Hodora — Free GPX Navigation for Club Rides & Bike Events";
const DESCRIPTION =
  "Free GPX bike navigation for club rides and cycling events. No dedicated bike computer, no subscription. Import routes, plan them on the map, and ride turn-by-turn, even offline.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: "https://hodora.app/" },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Hodora",
          url: "https://hodora.app/",
          description: DESCRIPTION,
          applicationCategory: "TravelApplication",
          operatingSystem: "Web, Android",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          featureList: [
            "GPX viewer",
            "Bike route planner",
            "Cycle route planner",
            "Turn-by-turn navigation",
            "Offline maps and routes",
            "No dedicated bike computer or subscription required",
          ],
        },
      },
    ],
    links: [{ rel: "canonical", href: "https://hodora.app/" }],
  }),
  component: Landing,
});

const features = [
  {
    icon: Upload,
    title: "Drop in a GPX",
    body: "Import the route your club or event organiser sent, whether it's from Komoot, Strava or RideWithGPS. It parses on your phone in a second.",
  },
  {
    icon: Mountain,
    title: "Know the climbing",
    body: "Elevation profile, total ascent and descent, and the grade of what's coming next.",
  },
  {
    icon: Compass,
    title: "Turn-by-turn",
    body: "Live GPS following with turn prompts, distance to go, and an alert the moment you drift off route. It does everything a bike computer does, for free.",
  },
];

function Landing() {
  const { user, loading } = useUser();
  const { theme, toggle } = useTheme();

  return (
    <main className="hero-surface min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-5 pb-24">
        <nav className="flex h-20 items-center justify-between">
          <HodoraLogo textClassName="text-xl font-extrabold" />
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

        <section className="pt-16 sm:pt-24">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
            For club rides &amp; bike events
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Your club run,{" "}
            <span className="font-serif font-normal italic text-rust">navigated properly</span>.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Drop in the GPX for your club ride or next event and follow it with turn-by-turn
            directions on your phone. No bike computer to buy, no subscription to pay for, and it's
            free and open source.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="glow-ring">
              <Link to="/rides">
                <span className="sm:hidden">{user ? "Open my rides" : "Start riding"}</span>
                <span className="hidden sm:inline">
                  {user ? "Open my rides" : "Start riding — no account needed"}
                </span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/explore">Explore routes near me</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={ANDROID_RELEASES_URL} target="_blank" rel="noreferrer">
                <AndroidIcon className="size-4" />
                Get Android app
              </a>
            </Button>
            <span className="text-sm text-muted-foreground">
              {user
                ? "Your rides stay private."
                : "Sign in later to sync your routes across devices."}
            </span>
          </div>
        </section>

        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="surface p-6">
              <feature.icon className="size-5 text-primary" />
              <h2 className="mt-4 text-base font-bold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-20 grid gap-8 sm:grid-cols-3">
          <div>
            <h2 className="text-lg font-bold">A free GPX viewer, built for club rides</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Import the organiser's GPX for your next club ride, sportive or event and Hodora shows
              you the route on an interactive map, with distance, elevation and total climbing at a
              glance. No bike computer required.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold">
              <Link to="/plan" className="hover:text-primary">
                Bike route planner
              </Link>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Tap the map to{" "}
              <Link to="/plan" className="underline underline-offset-2 hover:text-primary">
                plan a cycle route
              </Link>{" "}
              routed over real roads and paths with OpenStreetMap data, then save it and ride it
              turn by turn.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-bold">
              <Link to="/explore" className="hover:text-primary">
                Cycle routes near you
              </Link>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              <Link to="/explore" className="underline underline-offset-2 hover:text-primary">
                Explore bike trails and mountain bike routes near me
              </Link>{" "}
              from OpenStreetMap, or generate a loop ride of any distance to discover new roads.
            </p>
          </div>
        </section>

        <footer className="mt-24 border-t border-border pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-md text-sm text-muted-foreground">
              Hodora is a free, open-source GPX bike navigation app for club rides and cycling
              events. No ads, no tracking, no subscription. It's a learn-by-doing project, so
              feedback and contributions are very welcome.
            </p>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
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
        </footer>
      </div>
    </main>
  );
}
