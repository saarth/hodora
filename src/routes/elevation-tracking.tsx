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

const TITLE = "Elevation Tracking for Cycling — Profile, Gain & Grade | Hodora";
const DESCRIPTION =
  "Free elevation tracking for cycling: elevation profile, total ascent and descent, live gradient while you ride, and climbing left to go. From any GPX route or a ride you record.";

const FEATURES = [
  "Elevation profile for every route",
  "Total ascent and descent, noise-filtered",
  "Live grade of the next 200 metres while navigating",
  "Remaining climbing during a ride",
  "Elevation gain recorded from GPS rides",
];

const MEASURES = [
  {
    title: "The elevation profile",
    body: "The shape of the whole route, drawn against distance, so you can see at a glance whether it's a steady drag, three separate climbs or a sting in the last 10 km. Scrub along it to read the height at any point.",
  },
  {
    title: "Total ascent and descent",
    body: "How much climbing the route contains, in metres or feet, computed with a noise filter so GPS wobble doesn't inflate it. It's the single number that decides how hard a ride will feel.",
  },
  {
    title: "Live grade",
    body: "While navigating, the average gradient of the next 200 metres — the number that tells you whether to shift down now or ride the ramp over. A single-point gradient jumps around too much to be useful; an average over the road ahead doesn't.",
  },
  {
    title: "Climbing left to go",
    body: "The ascent still ahead of you on the route, updated as you ride, so you know what you're rationing your legs for.",
  },
];

const FAQS: FaqItem[] = [
  {
    question: "How do I see the elevation profile of a GPX route?",
    answer:
      "Import the GPX into Hodora and the elevation profile is drawn automatically alongside the map, with total ascent and descent for the route. It's free, runs in the browser, and needs no account — you can drop in a file just to look at the climbing before deciding whether to ride it.",
  },
  {
    question: "How is total elevation gain calculated?",
    answer:
      "Hodora smooths the elevation series with a short moving average, then adds up every rise between consecutive points, ignoring changes smaller than half a metre. That threshold matters: raw GPS altitude jitters constantly, and summing it unfiltered can add hundreds of phantom metres to a flat ride.",
  },
  {
    question: "Why do different apps report different elevation gain for the same ride?",
    answer:
      "Because they smooth and threshold differently, and because the underlying altitude data differs — a barometric altimeter, a GPS fix and a terrain model all disagree. The numbers are best compared within one tool rather than between tools; the shape of the profile is more reliable than the absolute total.",
  },
  {
    question: "Does elevation tracking work on rides I record?",
    answer:
      "Yes. Recording a ride logs elevation along with distance, time and speed, and applies the same smoothing and noise filtering, so the ascent figure for a recorded ride is computed the same way as for an imported route. The recorded ride is saved as a route you can look at and ride again.",
  },
  {
    question: "What if my GPX has no elevation data?",
    answer:
      "Some exports contain coordinates only. Routes you plan inside Hodora get elevation from the routing engine as part of the path geometry, and recorded rides get it from your phone. An imported file with no elevation will show distance and turns, but there is no profile to draw from data that isn't there.",
  },
  {
    question: "Can I see the gradient while I'm riding?",
    answer:
      "Yes. Navigation shows the average grade of the road immediately ahead of you, alongside the distance to the next turn and the climbing remaining, so the information you need on a climb is on the same screen you're already following.",
  },
];

export const Route = createFileRoute("/elevation-tracking")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/elevation-tracking") },
      { name: "twitter:card", content: "summary_large_image" },
      {
        "script:ld+json": appJsonLd({
          path: "/elevation-tracking",
          description: DESCRIPTION,
          featureList: FEATURES,
        }),
      },
      {
        "script:ld+json": breadcrumbJsonLd([
          { name: "Elevation tracking", path: "/elevation-tracking" },
        ]),
      },
      { "script:ld+json": faqJsonLd(FAQS) },
    ],
    links: canonicalLink("/elevation-tracking"),
  }),
  component: ElevationTrackingPage,
});

function ElevationTrackingPage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">Elevation tracking</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          Know the climbing{" "}
          <span className="font-serif font-normal italic text-rust">before your legs do</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Free elevation tracking for any route: the full profile and total ascent before you set
          off, then the gradient of the road ahead and the climbing still to come while you ride.
          Works on imported GPX files, routes you plan, and rides you record.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              See a route's climbing
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/plan">Plan a route with a profile</Link>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="measures">
          <h2 id="measures" className="text-2xl font-bold sm:text-3xl">
            Four numbers that decide how a ride feels
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {MEASURES.map((measure) => (
              <section key={measure.title} className="surface p-6">
                <h3 className="text-base font-bold">{measure.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{measure.body}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="how-measured">
          <h2 id="how-measured" className="text-2xl font-bold sm:text-3xl">
            How the climbing is actually measured
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Elevation gain sounds like a simple sum — add up every rise — and that naive version
              is why two apps can disagree by hundreds of metres on the same ride. Raw altitude data
              jitters by a metre or two constantly, even standing still, and summing that noise over
              a few thousand track points invents climbing that was never there.
            </p>
            <p>
              Hodora smooths the elevation series with a short moving average first, then counts a
              rise only once it exceeds half a metre. The result is a figure that tracks the road
              rather than the receiver. Imported GPX files and rides you record both go through it,
              because both carry raw GPS altitude. Routes built in the planner skip the smoothing
              and keep only the half-metre threshold — their elevation comes from the routing engine
              rather than a receiver on a moving bike, so there is no jitter to smooth out and
              averaging it would only flatten real terrain.
            </p>
            <p>
              Live gradient gets the same treatment for the same reason. A gradient computed between
              two adjacent points swings wildly; averaging over the next 200 metres of road gives
              you a number that means something when you are deciding which gear to be in.
            </p>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="where-from">
          <h2 id="where-from" className="text-2xl font-bold sm:text-3xl">
            Where the elevation data comes from
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              An imported GPX usually carries elevation recorded by whatever device or planner
              created it. Routes planned inside Hodora take theirs from the routing engine, which
              returns height along the path it builds over OpenStreetMap data. A recorded ride uses
              the altitude your phone reports along the way.
            </p>
            <p>
              Occasionally a file arrives with coordinates only and no heights at all. Hodora shows
              what it has — distance, turns, the map — rather than inventing a profile from a
              terrain model and presenting a guess as data.
            </p>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The profile is one part of the picture before a ride; the rest is in{" "}
            <Link to="/gpx-routes" className="underline underline-offset-2 hover:text-foreground">
              GPX route management
            </Link>{" "}
            and{" "}
            <Link
              to="/turn-by-turn-navigation"
              className="underline underline-offset-2 hover:text-foreground"
            >
              turn-by-turn navigation
            </Link>
            .
          </p>
        </section>

        <FaqSection heading="Elevation tracking FAQ" items={FAQS} />
      </article>
    </MarketingLayout>
  );
}
