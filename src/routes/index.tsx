import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Mountain, Route as RouteIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { useTheme } from "@/lib/theme";
import { Moon, Sun } from "lucide-react";

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
            <span className="font-display text-lg font-extrabold tracking-tight">
              Hodora
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {!loading && (
              <Button asChild variant={user ? "default" : "secondary"}>
                <Link to={user ? "/rides" : "/auth"}>
                  {user ? "My rides" : "Sign in"}
                </Link>
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
            Hodora turns a GPX file into a ride you can actually follow — distance,
            climbing, and calm turn-by-turn guidance that keeps working when the road
            gets quiet.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="glow-ring">
              <Link to="/rides">
                {user ? "Open my rides" : "Start riding — no account needed"}
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
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.body}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
