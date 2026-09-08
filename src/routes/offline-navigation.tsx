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

const TITLE = "Offline Bike Navigation & Offline Maps for Cycling | Hodora";
const DESCRIPTION =
  "Save routes and map tiles to your phone and navigate with no signal. Free offline navigation for cycling — offline maps, cue sheet, elevation profile and turn prompts, all on-device.";

const FEATURES = [
  "Offline maps saved per route",
  "Offline route storage in the browser's own database",
  "Turn prompts, cue sheet and elevation profile computed on-device",
  "Works in airplane mode once saved",
  "Installable as an app, so it opens with no connection",
];

/** What survives losing signal, and what genuinely doesn't. Both are worth saying. */
const WORKS = [
  "Your position on the map, from GPS",
  "The route line and the map around it",
  "Turn-by-turn prompts and voice announcements",
  "The full cue sheet",
  "Elevation profile, remaining climbing and live grade",
  "Distance and speed while you ride",
];

const NEEDS_SIGNAL = [
  "Downloading map tiles you didn't save first",
  "Saving a recorded ride to your account — signed out, it saves to the device",
  "Live weather, wind and rain alerts",
  "Routed rejoin guidance after an off-route alert (it falls back to a direct line)",
  "Searching for places, and finding nearby cafés or bike shops",
  "Syncing routes to your other devices",
];

const FAQS: FaqItem[] = [
  {
    question: "Can I use bike navigation with no internet?",
    answer:
      "Yes. Save a route for offline use while you still have a connection and Hodora stores both the route and the map tiles around it on your device. After that, navigation, the map, turn prompts, the cue sheet and the elevation profile all work with no signal at all — including in airplane mode.",
  },
  {
    question: "Does GPS work without a mobile signal?",
    answer:
      "Yes. GPS is a one-way satellite signal your phone receives directly, and it does not depend on a mobile network. What needs a connection is downloading maps and live data, which is exactly why saving map tiles in advance turns a phone into a device you can navigate with anywhere.",
  },
  {
    question: "How do I save maps offline for cycling?",
    answer:
      "Open a saved route in Hodora and use its offline save option. It downloads the map tiles that cover the route corridor, across the zoom levels you actually navigate at, and keeps them alongside the route data on your device. The route list can then be filtered to show only the routes you have available offline.",
  },
  {
    question: "How much storage do offline maps use?",
    answer:
      "Only the corridor along your route is saved, not whole regions, so a typical day ride is tens of megabytes rather than gigabytes. Hodora estimates the download before it starts and caps very long routes so a single save cannot fill your phone, and you can remove a route's saved tiles again at any time.",
  },
  {
    question: "What still needs a connection while riding offline?",
    answer:
      "Live weather and rain alerts, place search, nearby amenities, and the routed rejoin path after an off-route alert — that last one falls back to showing the direct line back to the course. Saving a newly recorded ride to your account also needs a connection, though signed out it saves straight to the device. Everything needed to follow the route itself is computed on the device.",
  },
  {
    question: "Does the app open at all with no signal?",
    answer:
      "Yes, if you install it. Hodora is a progressive web app, so adding it to your home screen stores the app itself on the device through a service worker. It opens and runs offline like any installed app, rather than needing to fetch itself from the network first.",
  },
  {
    question: "Is offline navigation free?",
    answer:
      "Yes. Offline maps and offline routes are included at no cost, as is everything else in Hodora — there is no paid tier. Several well-known cycling apps put offline maps behind a subscription; this one is open source under the MIT licence.",
  },
];

export const Route = createFileRoute("/offline-navigation")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/offline-navigation") },
      { name: "twitter:card", content: "summary_large_image" },
      {
        "script:ld+json": appJsonLd({
          path: "/offline-navigation",
          description: DESCRIPTION,
          featureList: FEATURES,
        }),
      },
      {
        "script:ld+json": breadcrumbJsonLd([
          { name: "Offline navigation", path: "/offline-navigation" },
        ]),
      },
      { "script:ld+json": faqJsonLd(FAQS) },
    ],
    links: canonicalLink("/offline-navigation"),
  }),
  component: OfflineNavigationPage,
});

function OfflineNavigationPage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">Offline navigation</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          Navigation that{" "}
          <span className="font-serif font-normal italic text-rust">doesn't need a signal</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          The good roads are the ones without coverage. Save a route and its maps to your phone
          before you leave and Hodora navigates it with the network switched off entirely — turn
          prompts, cue sheet, elevation profile and your position on the map, all computed
          on-device. Free, with no subscription for offline maps.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Save a route offline
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/plan">Plan a route</Link>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-2xl font-bold sm:text-3xl">
            How offline maps work here
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Saving a route offline does two things. The route itself — every point, the elevation,
              the cue sheet — goes into a database inside your browser, so it is available whether
              or not you can reach a server. Then the map tiles covering the corridor along that
              route are downloaded and kept in the same place.
            </p>
            <p>
              Only the corridor is saved, at the handful of zoom levels you actually navigate at, so
              a day ride costs tens of megabytes rather than the gigabytes a whole-region download
              would. Hodora estimates the size before it starts, caps very long routes so one save
              cannot swallow your storage, and lets you delete a route's tiles again when the ride
              is done.
            </p>
            <p>
              Because Hodora is an installable progressive web app, the app itself is stored on the
              device too. Opening it in a dead zone works the same as opening any installed app —
              there is nothing to download first.
            </p>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="what-works">
          <h2 id="what-works" className="text-2xl font-bold sm:text-3xl">
            What works offline, and what doesn't
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Worth knowing before you rely on it, rather than finding out on the road.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <section className="surface p-6">
              <h3 className="text-base font-bold">Works with no signal</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                {WORKS.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true" className="text-rust">
                      &rarr;
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="surface p-6">
              <h3 className="text-base font-bold">Needs a connection</h3>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
                {NEEDS_SIGNAL.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true" className="text-muted-foreground/60">
                      &rarr;
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Offline maps are also the reason a phone holds up as a{" "}
            <Link
              to="/bike-computer-alternative"
              className="underline underline-offset-2 hover:text-foreground"
            >
              bike computer alternative
            </Link>{" "}
            — no data all day is easier on the battery than a constant search for signal. See also{" "}
            <Link
              to="/turn-by-turn-navigation"
              className="underline underline-offset-2 hover:text-foreground"
            >
              turn-by-turn navigation
            </Link>
            .
          </p>
        </section>

        <FaqSection heading="Offline navigation FAQ" items={FAQS} />
      </article>
    </MarketingLayout>
  );
}
