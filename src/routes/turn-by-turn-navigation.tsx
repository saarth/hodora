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

const TITLE = "Turn-by-Turn Navigation for Cycling — Free | Hodora";
const DESCRIPTION =
  "Free turn-by-turn navigation for cycling: distance to the next turn, spoken turn announcements, a full cue sheet, live grade and off-route alerts, from any GPX route.";

const FEATURES = [
  "Turn-by-turn cycling directions from any GPX route",
  "Spoken turn announcements via the browser's speech synthesis",
  "Full cue sheet with street names on routes planned in-app",
  "Off-route alerts with a routed way back to the course",
  "Distance to the next turn, distance remaining and remaining climbing",
  "Average grade of the next 200 metres",
];

/** What is actually on screen while navigating, in the order it matters at speed. */
const ON_SCREEN = [
  {
    title: "The next turn",
    body: "Direction, distance to it, and — on routes planned in Hodora, where the router returned step data — the name of the road you are turning onto. Imported GPX files carry no street names, so those turns are detected from the track's own geometry instead.",
  },
  {
    title: "What's left",
    body: "Distance remaining to the finish and the climbing still to come, so you can judge whether to ride the next section hard or sit in.",
  },
  {
    title: "The gradient you're on",
    body: "The average grade over the next 200 metres, which is the number that tells you whether a ramp is a 30-second effort or the start of something longer.",
  },
  {
    title: "Where you are on the course",
    body: "Your position snapped to the route line on a cycling map, with the elevation profile marking how far through the route you are.",
  },
];

const FAQS: FaqItem[] = [
  {
    question: "What is turn-by-turn navigation for cycling?",
    answer:
      "Turn-by-turn navigation follows your GPS position along a route and tells you what to do at each junction as you reach it — the direction of the turn, the distance to it, and often the road name — instead of leaving you to read a map. On a bike it matters more than in a car, because you cannot safely study a screen while riding in a group.",
  },
  {
    question: "How does Hodora give turn-by-turn directions from a GPX file?",
    answer:
      "A GPX file is a list of coordinates, not a list of instructions, so Hodora derives the turns from the track itself: it walks the route, measures the change in bearing at each point, and treats anything above about 35 degrees as a turn. Routes planned inside Hodora go one better, because the routing engine returns real step data with street names, which becomes the cue sheet.",
  },
  {
    question: "Does it announce turns out loud?",
    answer:
      "Yes. Voice announcements use the browser's built-in speech synthesis, so there is no extra service or account involved, and you can turn them on or off during navigation. Spoken prompts are what let you keep your eyes on the wheel in front of you rather than on the screen.",
  },
  {
    question: "What happens if I go off route?",
    answer:
      "Hodora continuously measures how far you are from the route line. Once you are clearly off it, you get an off-route alert and it works out a cycling-friendly way back to the nearest point on the course over real roads and paths. With no data connection it falls back to showing the direct line back to the route.",
  },
  {
    question: "Can I see all the turns before I set off?",
    answer:
      "Yes. Every route has a full cue sheet — the complete list of turns with the distance between them — which you can read before the ride or scroll to mid-ride to see what is coming after the next junction.",
  },
  {
    question: "Does navigation keep running with the screen off?",
    answer:
      "No. Navigation runs in the foreground and holds a wake lock to keep the screen on while you ride, which is the right trade-off for a phone mounted on the bars. Mobile browsers suspend timers and location updates once a tab is hidden, so guidance pauses if you background the app or lock the screen.",
  },
  {
    question: "Do I need a data connection for turn-by-turn navigation?",
    answer:
      "No, provided you saved the route for offline use beforehand. Turn detection, the cue sheet, voice prompts and the elevation profile are all computed on the device from the route itself. Only the rejoin routing after an off-route alert needs the network, and it falls back to a direct line without it.",
  },
];

export const Route = createFileRoute("/turn-by-turn-navigation")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/turn-by-turn-navigation") },
      { name: "twitter:card", content: "summary_large_image" },
      {
        "script:ld+json": appJsonLd({
          path: "/turn-by-turn-navigation",
          description: DESCRIPTION,
          featureList: FEATURES,
        }),
      },
      {
        "script:ld+json": breadcrumbJsonLd([
          { name: "Turn-by-turn navigation", path: "/turn-by-turn-navigation" },
        ]),
      },
      { "script:ld+json": faqJsonLd(FAQS) },
    ],
    links: canonicalLink("/turn-by-turn-navigation"),
  }),
  component: TurnByTurnPage,
});

function TurnByTurnPage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          Turn-by-turn navigation
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          Turn-by-turn navigation{" "}
          <span className="font-serif font-normal italic text-rust">for the bike</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Free turn-by-turn cycling navigation from any GPX route: the direction of the next turn
          and the distance to it, spoken announcements so you can keep your eyes up, a full cue
          sheet, the grade of the ramp you are on, and an alert the moment you leave the course.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Load a route and navigate
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/plan">Plan one first</Link>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="on-screen">
          <h2 id="on-screen" className="text-2xl font-bold sm:text-3xl">
            What's on screen while you ride
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {ON_SCREEN.map((item) => (
              <section key={item.title} className="surface p-6">
                <h3 className="text-base font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="how-turns">
          <h2 id="how-turns" className="text-2xl font-bold sm:text-3xl">
            How turn instructions come out of a plain GPX
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              A GPX file is a list of coordinates. It knows where the route goes; it does not know
              that the 400th point is a left onto Mill Lane. Apps that only draw the line are
              leaving that gap for you to fill at 30 km/h.
            </p>
            <p>
              Hodora closes it by reading the geometry. It walks the track measuring how sharply the
              bearing changes, and treats anything past roughly 35 degrees as a turn worth calling —
              tight enough to catch a real junction, loose enough to ignore the drift of a bending
              road. That gives you a complete set of turns, with distances between them, from a file
              that contained no instructions at all.
            </p>
            <p>
              Routes planned inside Hodora get the better version: the routing engine hands back
              real step data, so the cue sheet carries street names, roundabout exits and fork
              directions rather than "left in 300 m".
            </p>
            <p>
              Either way, the work happens on your phone. That is what makes{" "}
              <Link
                to="/offline-navigation"
                className="underline underline-offset-2 hover:text-foreground"
              >
                offline navigation
              </Link>{" "}
              possible: no connection is needed to know where the next turn is.
            </p>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="off-route">
          <h2 id="off-route" className="text-2xl font-bold sm:text-3xl">
            Off-route alerts and getting back on
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Every rider misses a turn. What separates a good navigation app from an irritating one
              is the next thirty seconds. Hodora tracks your distance from the route line
              continuously, so a wrong turn registers almost immediately rather than after a
              kilometre of committed riding.
            </p>
            <p>
              Once you are off, it routes you back to the nearest point on the course over roads and
              paths a bike can actually use, and keeps that rejoin line updated as you move. With no
              signal — the situation where you are most likely to be lost — it falls back to the
              direct line back to the route, which is still enough to get you pointed the right way.
            </p>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Turn-by-turn is one part of using a phone{" "}
            <Link
              to="/bike-computer-alternative"
              className="underline underline-offset-2 hover:text-foreground"
            >
              instead of a bike computer
            </Link>
            . The climbing side is covered on{" "}
            <Link
              to="/elevation-tracking"
              className="underline underline-offset-2 hover:text-foreground"
            >
              elevation tracking
            </Link>
            .
          </p>
        </section>

        <FaqSection heading="Turn-by-turn navigation FAQ" items={FAQS} />
      </article>
    </MarketingLayout>
  );
}
