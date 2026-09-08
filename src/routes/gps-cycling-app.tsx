import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FaqSection } from "@/components/FaqSection";
import { MarketingLayout } from "@/components/MarketingLayout";
import {
  absoluteUrl,
  appJsonLd,
  breadcrumbJsonLd,
  canonicalLink,
  faqJsonLd,
  type FaqItem,
} from "@/lib/seo";

const TITLE = "Free GPS App for Cycling — Navigation & Ride Tracking | Hodora";
const DESCRIPTION =
  "A free GPS app for cycling: record rides with distance, speed and elevation, navigate routes turn by turn, and use offline maps. Open source, no subscription, no ads, no tracking.";

const FEATURES = [
  "Free GPS ride recording — distance, time, speed, elevation gain",
  "Turn-by-turn cycling navigation from any GPX",
  "Offline maps and offline routes",
  "Bike route planner over OpenStreetMap data",
  "Live weather, wind and rain alerts while you ride",
  "Nearby cafés, water, toilets and bike shops",
  "No ads, no tracking, no subscription",
];

const USES = [
  {
    title: "Record a ride",
    body: "Start recording and Hodora logs your track from the phone's GPS: distance, moving time, speed and elevation gain, with a speed history you can scrub through afterwards. Stop, name it, and the ride is saved as a route you can navigate again any time.",
    to: "/record" as const,
    cta: "Record a ride",
  },
  {
    title: "Navigate a route",
    body: "Import a GPX from any planner, or open one you recorded, and follow it with turn-by-turn directions, spoken turn prompts, a cue sheet and off-route alerts. This is the part most cycling apps charge a subscription for.",
    to: "/rides" as const,
    cta: "Open my routes",
  },
  {
    title: "Plan where to go",
    body: "Tap the map to build a route over real roads and cycle paths, or search for a place to start from. You get the distance, the elevation profile and a weather forecast for your departure time before you commit to it.",
    to: "/plan" as const,
    cta: "Plan a route",
  },
  {
    title: "Find routes near you",
    body: "Search OpenStreetMap for cycle routes and bike trails around your location, or generate a loop of roughly the distance you have time for, then save whichever looks good.",
    to: "/explore" as const,
    cta: "Explore nearby",
  },
];

const FAQS: FaqItem[] = [
  {
    question: "What is the best free GPS app for cycling?",
    answer:
      "The strongest free options are the ones that include navigation rather than only recording, since most cycling apps keep turn-by-turn behind a subscription. Hodora is free and open source and includes both: GPS ride recording with distance, speed and elevation, and turn-by-turn navigation of any GPX route, plus offline maps — with no paid tier at all.",
  },
  {
    question: "Can a phone replace a cycling GPS computer?",
    answer:
      "For most riding, yes. A phone has an equivalent GPS receiver, a much larger map screen and a data connection for live weather. With a handlebar mount and an app built for cycling, it covers navigation, ride recording and route planning. Dedicated head units still win on multi-day battery life and sunlight readability.",
  },
  {
    question: "How accurate is phone GPS for cycling?",
    answer:
      "Modern phones are accurate to roughly 3–5 metres in the open, which is well within what route following and distance recording need. Accuracy drops in dense forest, deep valleys and between tall buildings — the same conditions that affect any GPS device, including a bike computer.",
  },
  {
    question: "Does the GPS work without mobile data?",
    answer:
      "Yes. GPS is a satellite signal your phone receives directly and does not need a mobile connection. What does need data is downloading map tiles, so save your route and its maps offline before you leave and the whole ride works with the phone in airplane mode apart from the location services.",
  },
  {
    question: "Does Hodora track me or sell my data?",
    answer:
      "No. There are no ads, no analytics trackers and no data sales. Routes are stored on your device by default, an account exists only to sync them between your own devices, and you can sync to your own Nextcloud, Google Drive or OneDrive — or self-host the entire app, since the source is MIT-licensed on GitHub.",
  },
  {
    question: "How do I stop a cycling GPS app from draining the battery?",
    answer:
      "Save the route and map tiles offline so the app is not pulling data all ride, turn on Hodora's low-power mode, drop the screen brightness, and use a handlebar mount that lets you leave the screen off between junctions while voice prompts do the work. A small power bank covers an all-day ride comfortably.",
  },
  {
    question: "Can I export the rides I record?",
    answer:
      "Yes. Recorded rides are saved as routes in your library, and can be exported as GPX to use in any other tool, uploaded to a training platform, or shared with the riders you were out with.",
  },
];

export const Route = createFileRoute("/gps-cycling-app")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/gps-cycling-app") },
      { name: "twitter:card", content: "summary_large_image" },
      {
        "script:ld+json": appJsonLd({
          path: "/gps-cycling-app",
          description: DESCRIPTION,
          featureList: FEATURES,
        }),
      },
      {
        "script:ld+json": breadcrumbJsonLd([
          { name: "Free GPS app for cycling", path: "/gps-cycling-app" },
        ]),
      },
      { "script:ld+json": faqJsonLd(FAQS) },
    ],
    links: canonicalLink("/gps-cycling-app"),
  }),
  component: GpsCyclingAppPage,
});

function GpsCyclingAppPage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          GPS app for cycling
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          A free GPS app for cycling{" "}
          <span className="font-serif font-normal italic text-rust">
            that navigates, not just records
          </span>
          .
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Most cycling GPS apps will happily record your ride for nothing and then ask for a
          subscription the moment you want directions. Hodora does both for free: log the ride from
          your phone's GPS, and follow a route turn by turn with offline maps when you want to go
          somewhere new.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/record">
              Start recording a ride
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/rides">Navigate a route</Link>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="four-things">
          <h2 id="four-things" className="text-2xl font-bold sm:text-3xl">
            Four things a cycling GPS app should do
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {USES.map((use) => (
              <section key={use.title} className="surface flex flex-col p-6">
                <h3 className="text-base font-bold">{use.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {use.body}
                </p>
                <Link
                  to={use.to}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  {use.cta}
                  <ArrowRight className="size-3.5" />
                </Link>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="whats-free">
          <h2 id="whats-free" className="text-2xl font-bold sm:text-3xl">
            What "free" actually means here
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Free cycling apps usually mean one of three things: free with ads, free until you want
              the feature you downloaded it for, or free while the company works out how to charge
              you later. Hodora is none of them. It is open-source software under the MIT licence,
              built as a personal project rather than a business, with no paid tier to graduate to.
            </p>
            <p>
              The running costs are near zero because it leans on open data and keyless public
              services — OpenStreetMap for the maps and routing, Open-Meteo for the weather — and
              because your routes live on your own device rather than in a subscription-funded
              cloud.
            </p>
            <p>
              If you would rather not depend on someone else's deployment at all, the whole thing
              self-hosts: clone the repository, point it at your own database, and run your own
              cycling GPS on your own domain.
            </p>
          </div>
          <ul className="mt-8 grid max-w-3xl gap-3 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span aria-hidden="true" className="text-rust">
                  &rarr;
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Riding with a group this weekend? Start with{" "}
            <Link to="/club-rides" className="underline underline-offset-2 hover:text-foreground">
              bike navigation for club rides
            </Link>
            , or read what to look for in a{" "}
            <Link
              to="/bike-navigation-app"
              className="underline underline-offset-2 hover:text-foreground"
            >
              bike navigation app
            </Link>
            .
          </p>
        </section>

        <FaqSection heading="Cycling GPS app FAQ" items={FAQS} />
      </article>
    </MarketingLayout>
  );
}
