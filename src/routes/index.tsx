import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BatteryCharging,
  Compass,
  DollarSign,
  Mountain,
  Upload,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AndroidIcon,
  ANDROID_RELEASES_URL,
  GUIDES,
  MarketingLayout,
} from "@/components/MarketingLayout";
import { useUser } from "@/hooks/use-user";
import { FaqSection } from "@/components/FaqSection";
import {
  absoluteUrl,
  appJsonLd,
  canonicalLink,
  faqJsonLd,
  organizationJsonLd,
  type FaqItem,
} from "@/lib/seo";

const TITLE = "Free Bike Navigation App for Club Rides & GPX Routes | Hodora";
const DESCRIPTION =
  "A free bike navigation app and GPS for cycling. Import a club-ride GPX, plan a route on the map, and follow turn-by-turn directions offline — no bike computer, no subscription.";

const FEATURES = [
  "GPX bike navigation",
  "Turn-by-turn cycling directions with voice announcements",
  "Off-route alerts and automatic rejoin guidance",
  "Bike route planner over OpenStreetMap roads and paths",
  "GPS ride recording — distance, speed, elevation gain",
  "Offline maps and routes",
  "Live weather, headwind and rain alerts",
  "Free and open source — no subscription, no ads, no tracking",
];

/**
 * The landing page's short FAQ.
 *
 * Five questions, not twenty-five: the long list lives on `/faq`, and this one
 * answers only what someone deciding whether to open the app at all needs —
 * does it navigate, does it work offline, will it take my GPX, what does it
 * cost, can it replace my head unit. The wording is deliberately different
 * from the `/faq` entries covering the same ground, so the two pages aren't
 * two copies of one answer competing for the same query.
 *
 * The same array feeds `FaqSection` below and `faqJsonLd` in `head()` — a
 * `FAQPage` graph whose answers aren't visible on the page is what rich-result
 * validation rejects.
 */
const FAQS: FaqItem[] = [
  {
    question: "Does Hodora support turn-by-turn cycling navigation?",
    answer:
      "Yes, and it is built for cycling rather than adapted from driving directions. You get distance to the next turn, the grade of the climb ahead, a full cue sheet and optional spoken announcements. Turns are detected from the route's own geometry, so a plain GPX carrying no instructions still gives directions, with an off-route alert within seconds if you drift.",
  },
  {
    question: "Can I use Hodora offline?",
    answer:
      "Yes, with one thing done in advance. Save a route for offline use before you set off and Hodora stores the GPX and the map tiles along it on your phone; navigation, the cue sheet and the elevation profile then work with no signal at all. Live weather, place search and planning a brand-new route are the parts that still need a connection.",
  },
  {
    question: "Can I import a GPX route?",
    answer:
      "Yes. Drop in the GPX your club, sportive or event organiser sent and it parses on your phone in about a second — no upload, no account. Files exported from Komoot, Strava, Ride with GPS, Garmin Connect or a club's own website all work the same way, and you can export any route back out as GPX whenever you want it.",
  },
  {
    question: "Do I need an account or subscription?",
    answer:
      "Neither. Hodora is free and open source under the MIT licence, with no subscription, no paid tier, no ads and no trial to run out. Import a GPX and start navigating without signing up — routes live on your device. An account exists only so your library syncs between your own phone, tablet and desktop.",
  },
  {
    question: "Can my phone replace a bike computer?",
    answer:
      "For most riders on most rides, yes: the phone reads the same satellites, has the better screen, and costs nothing you have not already spent. Use a proper out-front mount and turn on low-power mode for all-day rides. A head unit still wins on waterproofing, gloved buttons and ANT+ power meters, which Hodora does not read.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: absoluteUrl("/") },
      {
        "script:ld+json": appJsonLd({
          path: "/",
          description: DESCRIPTION,
          featureList: FEATURES,
        }),
      },
      { "script:ld+json": organizationJsonLd() },
      { "script:ld+json": faqJsonLd(FAQS) },
    ],
    links: canonicalLink("/"),
  }),
  component: Landing,
});

const features = [
  {
    icon: Upload,
    title: "Drop in a GPX",
    body: "Import the route your club or event organiser sent, whether it came from Komoot, Strava, Ride with GPS or Garmin. It parses on your phone in a second — no upload, no account.",
  },
  {
    icon: Mountain,
    title: "Know the climb",
    body: "Elevation profile, total ascent and descent, and the grade of what's coming next, so you know whether to save something for the last 10 km.",
  },
  {
    icon: Compass,
    title: "Turn-by-turn",
    body: "Live GPS following with spoken turn prompts, distance to go and an alert the moment you drift off route. Everything a bike computer does, for free.",
  },
];

const STEPS = [
  {
    title: "Get the GPX",
    body: "Download the file your ride leader, club or event organiser sent — from an email, a WhatsApp group or the event website.",
  },
  {
    title: "Import it",
    body: "Open Hodora and drop the file in. You get the route on a cycling map with distance, climbing and an elevation profile straight away.",
  },
  {
    title: "Save it offline",
    body: "Tap save-for-offline the night before. The route and the map around it live on your phone, so a dead zone mid-ride doesn't cost you the navigation.",
  },
  {
    title: "Ride it",
    body: "Start navigation at the meeting point and follow turn prompts, the cue sheet and off-route alerts all the way round.",
  },
];

const ADVANTAGES = [
  {
    icon: DollarSign,
    title: "No hardware, no subscription",
    body: "A head unit plus a routing subscription is a few hundred up front and a renewal every year. Hodora is free and open source, and the phone is already in your jersey pocket.",
  },
  {
    icon: WifiOff,
    title: "Works without signal",
    body: "Routes and map tiles are stored on the device, so navigation carries on through valleys, forests and the parts of the club run where the bars disappear.",
  },
  {
    icon: BatteryCharging,
    title: "Built for long days",
    body: "Low-power mode trades a little GPS precision and weather-refresh frequency for battery on all-day rides, and light and dark themes keep the screen readable in bright sun and at dusk.",
  },
];

function Landing() {
  const { user } = useUser();

  return (
    <MarketingLayout>
      <section className="pt-16 sm:pt-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          Bike navigation app &middot; Cycling GPS &middot; Free &amp; open source
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-6xl">
          Free bike navigation,{" "}
          <span className="font-serif font-normal italic text-rust">built for club rides</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Hodora is a free GPS app for cycling that turns your phone into a bike computer. Drop in
          the GPX for your club ride, sportive or next event and follow it with turn-by-turn
          directions — offline if you need to, with no bike computer to buy and no subscription to
          pay for.
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
              Get the Android app
            </a>
          </Button>
        </div>
        {/* Hodora is a web app first — the Android build is the same site in a
            native shell. Framing it as "Android only" would turn away every
            iPhone rider, for whom it already works in the browser today. */}
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Android gets an installable app. On iPhone and everywhere else Hodora runs in the browser
          — add it to your home screen and it opens full-screen like any other app.{" "}
          <Link to="/how-to-use" className="underline underline-offset-2 hover:text-foreground">
            See how to set it up
          </Link>
          .{" "}
          {user ? "Your rides stay private." : "Sign in later to sync your routes across devices."}
        </p>
      </section>

      <section className="mt-20" aria-labelledby="what-it-does">
        <h2 id="what-it-does" className="sr-only">
          What Hodora does
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="surface p-6">
              <feature.icon className="size-5 text-primary" />
              <h3 className="mt-4 text-base font-bold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-20" aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-2xl font-bold sm:text-3xl">
          How to navigate a club ride GPX on your phone
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Four steps, and the only thing you need is the file the organiser already sent you.
        </p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="surface p-6">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-rust">
                Step {index + 1}
              </span>
              <h3 className="mt-3 text-base font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-muted-foreground">
          There's a longer walkthrough, plus tips for ride leaders, on{" "}
          <Link to="/how-to-use" className="underline underline-offset-2 hover:text-foreground">
            how to use Hodora
          </Link>
          .
        </p>
      </section>

      <section className="mt-20" aria-labelledby="phone-vs-computer">
        <h2 id="phone-vs-computer" className="text-2xl font-bold sm:text-3xl">
          Why a phone beats a bike computer for most riders
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {ADVANTAGES.map((advantage) => (
            <article key={advantage.title} className="surface p-6">
              <advantage.icon className="size-5 text-primary" />
              <h3 className="mt-4 text-base font-bold">{advantage.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{advantage.body}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          The full comparison is on{" "}
          <Link to="/bike-gps" className="underline underline-offset-2 hover:text-foreground">
            using your phone as a bike GPS
          </Link>
          , row by row and including what a head unit still does better.
        </p>
      </section>

      <section className="mt-20 grid gap-8 sm:grid-cols-3" aria-labelledby="more-ways">
        <h2 id="more-ways" className="sr-only">
          More ways to use Hodora
        </h2>
        <div>
          <h3 className="text-lg font-bold">A free GPX viewer, built for club rides</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Import the organiser's GPX for your next club ride, sportive or event and Hodora shows
            the route on an interactive cycling map, with distance, elevation and total climbing at
            a glance. No bike computer required.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-bold">
            <Link to="/plan" className="hover:text-primary">
              Bike route planner
            </Link>
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Tap the map to{" "}
            <Link to="/plan" className="underline underline-offset-2 hover:text-primary">
              plan a cycle route
            </Link>
            , routed over real roads and paths with OpenStreetMap data, then save it and ride it
            turn by turn.
          </p>
        </div>
        <div>
          <h3 className="text-lg font-bold">
            <Link to="/explore" className="hover:text-primary">
              Cycle routes near you
            </Link>
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <Link to="/explore" className="underline underline-offset-2 hover:text-primary">
              Explore bike trails and mountain bike routes near me
            </Link>{" "}
            from OpenStreetMap, or generate a loop ride of any distance to discover new roads.
          </p>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="guides">
        <h2 id="guides" className="text-2xl font-bold sm:text-3xl">
          Learn more
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          One guide that walks the whole thing through, and one page of answers.
        </p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {GUIDES.map((guide) => (
            <li key={guide.to}>
              <Link
                to={guide.to}
                className="surface flex h-full items-center justify-between gap-3 p-4 text-sm font-semibold transition-colors hover:text-primary"
              >
                {guide.label}
                <ArrowRight className="size-4 shrink-0 text-rust" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <FaqSection heading="FAQ" items={FAQS} />
      <p className="mt-6 text-sm text-muted-foreground">
        More answers — iPhone behaviour, battery, storage, privacy and self-hosting — on the{" "}
        <Link to="/faq" className="underline underline-offset-2 hover:text-foreground">
          full FAQ page
        </Link>
        .
      </p>
    </MarketingLayout>
  );
}
