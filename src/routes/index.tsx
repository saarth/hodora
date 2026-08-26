import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Compass, Mountain, Route as RouteIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { useTheme } from "@/lib/theme";
import { JsonLd } from "@/components/JsonLd";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  SITE_NAME,
  absoluteUrl,
  canonicalLink,
  seoMeta,
} from "@/lib/seo";
import { Moon, Sun } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: seoMeta({
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      path: "/",
    }),
    links: canonicalLink("/"),
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

/**
 * Answers to the questions people actually type into Google around GPX and
 * bike route planning. These are real page content first — the FAQPage
 * structured data below only describes what a reader can already see.
 */
const faqs = [
  {
    q: "What is a GPX file?",
    a: "GPX (GPS Exchange Format) is the standard file cyclists use to share a route. Every route planner — Komoot, Strava, Ride with GPS, Garmin Connect — can export one, and Hodora reads them all.",
  },
  {
    q: "Can I plan a bike route in Hodora?",
    a: "Yes. Explore finds signposted cycle routes around you from OpenStreetMap data, or generates a loop of whatever length you want, and saves it straight to your rides. You can also import a GPX you planned elsewhere.",
  },
  {
    q: "Does bike navigation work offline?",
    a: "Yes. Save a route and its map tiles to your device before you leave, and turn-by-turn navigation keeps working with no signal — which is most of the point on a long ride.",
  },
  {
    q: "Is Hodora free?",
    a: "Hodora is free and open source. Use the hosted app, or self-host it yourself from the source on GitHub.",
  },
];

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "TravelApplication",
    operatingSystem: "Web, Android, iOS",
    description: DEFAULT_DESCRIPTION,
    url: absoluteUrl("/"),
    image: absoluteUrl("/og-image.png"),
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "GPX route import",
      "Bike route planning and loop generation",
      "Turn-by-turn cycling navigation",
      "Elevation profiles and climbing totals",
      "Offline maps and routes",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
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
            Your GPX bike routes, planned and navigated properly.
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

        <section className="mt-20 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            GPX and bike route planning, answered
          </h2>
          <dl className="mt-6 space-y-4">
            {faqs.map((faq) => (
              <div key={faq.q} className="surface p-6">
                <dt className="text-base font-bold">{faq.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {faq.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <JsonLd data={structuredData} />
    </main>
  );
}
