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

const TITLE = "Bike Computer Alternative — Use Your Phone Instead | Hodora";
const DESCRIPTION =
  "A free bike computer alternative: turn-by-turn navigation, elevation, speed and ride recording on the phone you already own. What you gain, what you give up, and how to set it up.";

const FEATURES = [
  "Turn-by-turn navigation without a head unit",
  "Distance, speed, time and elevation gain while you ride",
  "Offline maps and routes",
  "Ride recording exportable as GPX",
  "Free and open source — no hardware cost, no subscription",
];

/**
 * An honest comparison, written so the cases where a head unit still wins are
 * stated first. A page that pretends the trade-off doesn't exist gets
 * discounted by readers and by the models summarising it.
 */
const HEAD_UNIT_WINS = [
  {
    title: "Battery measured in days",
    body: "A dedicated unit runs 15–40 hours on a charge. A phone navigating with the screen on is looking at 4–8, so anything longer needs a power bank or a dynamo.",
  },
  {
    title: "Screens built for sunlight",
    body: "Transflective displays get more readable as the sun gets brighter. A phone screen goes the other way, and fights back by burning battery on brightness.",
  },
  {
    title: "Weather and crash tolerance",
    body: "Head units are sealed, shock-rated and cheap to replace relative to a phone. Riding in winter rain with your only phone on the bars is a real risk calculation.",
  },
  {
    title: "Sensors and training data",
    body: "Power meters, heart-rate straps and cadence sensors pair over ANT+ and Bluetooth to a head unit built for structured training. Hodora is a navigation app, not a training computer.",
  },
];

const PHONE_WINS = [
  {
    title: "A map you can actually read",
    body: "Five or six inches of high-density colour against a two-inch monochrome-ish panel. Zooming, panning and finding the café stop are all things a phone does better.",
  },
  {
    title: "Nothing to buy",
    body: "The device is in your pocket already and the app is free and open source. A head unit with routing is a few hundred up front, often with a subscription behind the good maps.",
  },
  {
    title: "Getting the route on it is trivial",
    body: "The club GPX arrives on your phone in an email or a group chat. Import it in one tap — no cable, no desktop sync tool, no proprietary account in between.",
  },
  {
    title: "Live data while you ride",
    body: "Weather, a headwind or tailwind call-out relative to your direction of travel, a warning before rain arrives, and nearby cafés, water and bike shops from OpenStreetMap.",
  },
];

const SETUP = [
  {
    title: "Get a proper mount",
    body: "A rigid out-front or stem mount with a positive lock. Silicone-strap mounts are fine for a commute and a bad idea on a pothole-lined descent.",
  },
  {
    title: "Save the route offline the night before",
    body: "Route plus map tiles on the device means no scrambling for signal at the start and far less battery spent hunting for a network mid-ride.",
  },
  {
    title: "Turn on low-power mode and voice prompts",
    body: "Low-power mode eases the GPS chip out of high-accuracy mode and slows the weather refresh — a fair trade over six hours. Voice announcements mean you can drop the screen brightness and still know the next turn.",
  },
  {
    title: "Carry a small power bank for long days",
    body: "A 5,000 mAh bank in a top-tube bag covers a full sportive with the screen on, and weighs less than most head units.",
  },
];

const FAQS: FaqItem[] = [
  {
    question: "What is a good alternative to a bike computer?",
    answer:
      "The phone you already own, paired with a handlebar mount and a navigation app built for cycling. Hodora is a free, open-source bike computer alternative that gives you turn-by-turn navigation, distance, speed, elevation gain and ride recording, with offline maps so it works where there is no signal.",
  },
  {
    question: "Can a phone really replace a Garmin or Wahoo head unit?",
    answer:
      "For club rides, sportives and general road or gravel riding, yes — the phone has an equivalent GPS receiver and a far better map screen. Dedicated head units still win for multi-day touring and ultra-distance events, where battery life measured in days matters, and for structured training with power and heart-rate sensors.",
  },
  {
    question: "How long will my phone battery last navigating?",
    answer:
      "Expect roughly 4–8 hours with the screen on, depending on the phone, the brightness and the temperature. Saving maps offline, using low-power mode, relying on voice prompts and dimming the screen all extend it, and a small power bank in a top-tube bag comfortably covers an all-day ride.",
  },
  {
    question: "Is it safe to mount a phone on handlebars?",
    answer:
      "With a rigid, positively locking out-front or stem mount, yes — many riders do exactly this. Avoid cheap silicone-strap holders on rough surfaces, and if you ride in heavy winter rain consider a case rated for it. The genuine risk is that a phone is more expensive to replace than a head unit.",
  },
  {
    question: "Do I lose ride tracking if I stop using a head unit?",
    answer:
      "No. Hodora records rides from the phone's GPS with distance, elapsed time, speed and elevation gain, and saves each one as a route you can ride again or hand on as a standard GPX file. It records elapsed time with manual pause and resume rather than auto-pausing, so a long café stop is yours to pause.",
  },
  {
    question: "What does a bike computer do that this doesn't?",
    answer:
      "Pair with power meters, heart-rate straps and cadence sensors, run structured workouts, and go for days on one charge in a sealed, crash-tolerant case. Hodora is a navigation app rather than a training computer, and is deliberately honest about that line.",
  },
];

export const Route = createFileRoute("/bike-computer-alternative")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/bike-computer-alternative") },
      { name: "twitter:card", content: "summary_large_image" },
      {
        "script:ld+json": appJsonLd({
          path: "/bike-computer-alternative",
          description: DESCRIPTION,
          featureList: FEATURES,
        }),
      },
      {
        "script:ld+json": breadcrumbJsonLd([
          { name: "Bike computer alternative", path: "/bike-computer-alternative" },
        ]),
      },
      { "script:ld+json": faqJsonLd(FAQS) },
    ],
    links: canonicalLink("/bike-computer-alternative"),
  }),
  component: BikeComputerAlternativePage,
});

function BikeComputerAlternativePage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          Bike computer alternative
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          The bike computer{" "}
          <span className="font-serif font-normal italic text-rust">already in your pocket</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Before you spend a few hundred on a head unit, it is worth knowing what your phone already
          does. With a mount and a free app it navigates turn by turn, records the ride, shows the
          climbing and works offline. Here is the honest version of where that holds up and where it
          doesn't.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Try it on your next ride
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/record">Record a ride</Link>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="head-unit-wins">
          <h2 id="head-unit-wins" className="text-2xl font-bold sm:text-3xl">
            Where a dedicated bike computer still wins
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            If any of these describe your riding, buy the head unit. It is the right tool.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {HEAD_UNIT_WINS.map((item) => (
              <section key={item.title} className="surface p-6">
                <h3 className="text-base font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="phone-wins">
          <h2 id="phone-wins" className="text-2xl font-bold sm:text-3xl">
            Where the phone wins
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {PHONE_WINS.map((item) => (
              <section key={item.title} className="surface p-6">
                <h3 className="text-base font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="setup">
          <h2 id="setup" className="text-2xl font-bold sm:text-3xl">
            Setting a phone up as a bike computer
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2">
            {SETUP.map((item, index) => (
              <li key={item.title} className="surface p-6">
                <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-rust">
                  Step {index + 1}
                </span>
                <h3 className="mt-3 text-base font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The two features that make the swap work are{" "}
            <Link
              to="/offline-navigation"
              className="underline underline-offset-2 hover:text-foreground"
            >
              offline navigation
            </Link>{" "}
            and{" "}
            <Link
              to="/turn-by-turn-navigation"
              className="underline underline-offset-2 hover:text-foreground"
            >
              turn-by-turn directions
            </Link>
            . Both are free here.
          </p>
        </section>

        <FaqSection heading="Bike computer alternative FAQ" items={FAQS} />
      </article>
    </MarketingLayout>
  );
}
