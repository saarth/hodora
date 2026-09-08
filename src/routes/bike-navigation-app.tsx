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

const TITLE = "Bike Navigation App — Free Turn-by-Turn Cycling GPS | Hodora";
const DESCRIPTION =
  "What to look for in a bike navigation app, and how Hodora does it for free: GPX import, turn-by-turn cycling directions, off-route alerts, offline maps and route planning.";

const FEATURES = [
  "Turn-by-turn bike navigation from any GPX file",
  "Spoken turn announcements and a full cue sheet",
  "Off-route alerts with routed rejoin guidance",
  "Offline maps and offline routes",
  "Elevation profile and live grade",
  "Live weather, headwind and rain alerts",
  "Free and open source, with no subscription",
];

/**
 * The checklist a rider actually applies when choosing between apps. Ordered
 * by how often it decides the choice, not by how impressive the feature is —
 * "does it open the file I was sent" beats every other criterion in practice.
 */
const CRITERIA = [
  {
    title: "It opens the file you were sent",
    body: "Club rides, sportives and events circulate as GPX. An app that can't import one, or that hides GPX import behind a paid tier, fails before you have ridden a metre. Hodora parses the GPX on your phone — nothing is uploaded and no account is needed.",
  },
  {
    title: "It navigates, not just displays",
    body: "Drawing a purple line on a map is not navigation. You want distance to the next turn, the direction of that turn, the name of the road you are turning onto, and a voice prompt so you can keep your eyes up in a group.",
  },
  {
    title: "It tells you when you've gone wrong",
    body: "Every rider misses a turn. What matters is how quickly you find out and how easily you get back. Hodora raises an off-route alert within a few seconds and routes you back to the nearest point on the course over real roads.",
  },
  {
    title: "It works with no signal",
    body: "Coverage disappears in valleys, forests and on exactly the quiet roads good routes are made of. Offline maps and offline route storage are the difference between a navigation app and a navigation app you can rely on.",
  },
  {
    title: "It shows you the climbing",
    body: "An elevation profile with total ascent, and the grade of the ramp you are currently on, changes how you ride a route you have never seen before.",
  },
  {
    title: "It doesn't cost you a subscription",
    body: "Most of the well-known cycling apps put navigation behind an annual fee. Hodora is MIT-licensed and free, and you can self-host the whole thing if you would rather run it yourself.",
  },
];

const FAQS: FaqItem[] = [
  {
    question: "What is a bike navigation app?",
    answer:
      "A bike navigation app uses your phone's GPS to guide you along a cycling route in real time, giving turn-by-turn directions, distance to the next turn, the elevation ahead and a warning when you leave the course. It replaces a dedicated bike computer for most riders, because the phone already has the GPS receiver, the screen and the data connection.",
  },
  {
    question: "What is the best bike navigation app for cycling?",
    answer:
      "It depends on how you get your routes. If your rides come as GPX files from a club, an event organiser or a route planner, the best bike navigation app is the one that imports GPX quickly, navigates it turn by turn and works offline. Hodora does all three for free, is open source, and needs no account to get started.",
  },
  {
    question: "Is Hodora free?",
    answer:
      "Yes — completely. Hodora is open-source software under the MIT licence with no subscription, no paid tier, no ads and no tracking. Navigation, offline maps, the route planner and ride recording are all included, and you can self-host it on your own server if you prefer.",
  },
  {
    question: "Does the app give voice directions?",
    answer:
      "Yes. Hodora can announce turns out loud as you approach them, so you can keep your hands on the bars and your eyes on the wheel in front of you. Turn prompts, distance to go and a full cue sheet are also on screen.",
  },
  {
    question: "Can I plan a route in the app instead of importing one?",
    answer:
      "Yes. The built-in bike route planner lets you tap points on the map and routes between them over real roads and cycle paths using OpenStreetMap data, with an elevation profile and a weather forecast for your departure time. Save it and it becomes a route you can navigate like any other.",
  },
  {
    question: "Does a bike navigation app drain the battery?",
    answer:
      "Continuous GPS use costs battery on any phone. Hodora has a low-power mode for long rides, and storing routes and map tiles offline means it isn't using mobile data all day. A small USB power bank in a top-tube bag covers even a full-day sportive.",
  },
];

export const Route = createFileRoute("/bike-navigation-app")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/bike-navigation-app") },
      { name: "twitter:card", content: "summary_large_image" },
      {
        "script:ld+json": appJsonLd({
          path: "/bike-navigation-app",
          description: DESCRIPTION,
          featureList: FEATURES,
        }),
      },
      {
        "script:ld+json": breadcrumbJsonLd([
          { name: "Bike navigation app", path: "/bike-navigation-app" },
        ]),
      },
      { "script:ld+json": faqJsonLd(FAQS) },
    ],
    links: canonicalLink("/bike-navigation-app"),
  }),
  component: BikeNavigationAppPage,
});

function BikeNavigationAppPage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          Bike navigation app
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          A bike navigation app that{" "}
          <span className="font-serif font-normal italic text-rust">doesn't ask for a card</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Hodora is a free, open-source bike navigation app for phones. Import a GPX, or plan a
          route on the map, and ride it with turn-by-turn cycling directions, spoken turn prompts,
          off-route alerts and offline maps. No head unit to buy, no subscription, no account
          required to start.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Import a route and ride it
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/plan">Plan a route instead</Link>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="criteria">
          <h2 id="criteria" className="text-2xl font-bold sm:text-3xl">
            What to look for in a bike navigation app
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Six things separate an app you can trust on an unfamiliar 120 km route from one you'll
            abandon at the first junction.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {CRITERIA.map((criterion, index) => (
              <section key={criterion.title} className="surface p-6">
                <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-rust">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 text-base font-bold">{criterion.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {criterion.body}
                </p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="phone-or-head-unit">
          <h2 id="phone-or-head-unit" className="text-2xl font-bold sm:text-3xl">
            Phone or bike computer?
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              A dedicated head unit wins on two things: battery life measured in days, and a
              transflective screen that gets more readable in bright sun. If you race, tour
              unsupported, or ride ultra-distance events, that is worth the money.
            </p>
            <p>
              For everyone else — the Sunday club run, the local sportive, the first ride of a
              cycling holiday — the phone is already better equipped. It has a larger, higher-detail
              map, a real keyboard for searching a café stop, mobile data for live weather, and a
              GPS chip that is no worse than the one in a head unit costing several hundred. What
              was missing was software that treated the phone as a bike navigation device rather
              than a fitness tracker with a map bolted on.
            </p>
            <p>
              That is the gap Hodora fills. It expects you to arrive with a GPX, it puts the next
              turn and the current grade where you can read them at speed, and it keeps working when
              the signal goes.
            </p>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="what-you-get">
          <h2 id="what-you-get" className="text-2xl font-bold sm:text-3xl">
            What Hodora gives you
          </h2>
          <ul className="mt-6 grid max-w-3xl gap-3 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
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
            Riding with a group? See how it handles{" "}
            <Link to="/club-rides" className="underline underline-offset-2 hover:text-foreground">
              bike navigation for club rides
            </Link>
            . Just want to track the ride? Hodora also works as a{" "}
            <Link
              to="/gps-cycling-app"
              className="underline underline-offset-2 hover:text-foreground"
            >
              free GPS app for cycling
            </Link>
            .
          </p>
        </section>

        <FaqSection heading="Bike navigation app FAQ" items={FAQS} />
      </article>
    </MarketingLayout>
  );
}
