import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Mountain, Route as RouteIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { useTheme } from "@/lib/theme";
import { Moon, Sun } from "lucide-react";

const GITHUB_URL = "https://github.com/saarth/hodora";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.78-.25.78-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.59.24 2.76.12 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.15 0 1.55-.01 2.8-.01 3.18 0 .3.2.66.79.55A10.52 10.52 0 0 0 23.5 12c0-6.27-5.23-11.5-11.5-11.5Z" />
    </svg>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hodora — Ride your GPX routes" },
      {
        name: "description",
        content:
          "Import GPX files, see distance and climbing at a glance, then ride with live turn-by-turn navigation and off-route alerts.",
      },
      { property: "og:title", content: "Hodora — Ride your GPX routes" },
      {
        property: "og:description",
        content:
          "Import GPX files, see distance and climbing at a glance, then ride with live turn-by-turn navigation and off-route alerts.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: Upload,
    title: "Drop in a GPX",
    body: "Import any route export — Komoot, Strava, RideWithGPS. Parsed on device in a second.",
  },
  {
    icon: Mountain,
    title: "Know the climbing",
    body: "Elevation profile, total ascent and descent, and the grade of what's coming next.",
  },
  {
    icon: Compass,
    title: "Turn-by-turn",
    body: "Live GPS following with turn prompts, distance to go and an alert the moment you drift off route.",
  },
];

function Landing() {
  const { user, loading } = useUser();
  const { theme, toggle } = useTheme();

  return (
    <main className="hero-surface min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-5 pb-24">
        <nav className="flex h-20 items-center justify-between">
          <span className="flex items-center gap-2.5">
            <span className="accent-gradient flex size-9 items-center justify-center rounded-xl text-primary-foreground">
              <RouteIcon className="size-5" />
            </span>
            <span className="font-display text-lg font-extrabold tracking-tight">Hodora</span>
          </span>
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
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            GPX in. Ride out.
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">
            Your bike routes, navigated properly.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Hodora turns a GPX file into a ride you can actually follow — distance, climbing, and
            calm turn-by-turn guidance that keeps working when the road gets quiet.
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

        <footer className="mt-24 border-t border-border pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-md text-sm text-muted-foreground">
              Hodora is a free, open-source GPX bike navigation app — no ads, no tracking. Built as
              a learn-by-doing project, so feedback and contributions are very welcome.
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
