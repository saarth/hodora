import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FaqSection } from "@/components/FaqSection";
import { MarketingLayout } from "@/components/MarketingLayout";
import { absoluteUrl, breadcrumbJsonLd, canonicalLink, faqJsonLd, type FaqItem } from "@/lib/seo";

const TITLE = "Bike Navigation for Club Rides & Sportives | Hodora";
const DESCRIPTION =
  "Follow your club's GPX route turn by turn on your phone. Free bike navigation for club rides, sportives, gran fondos and group rides — offline maps, off-route alerts, no subscription.";

/**
 * `HowTo` structured data: the steps a rider follows between "the organiser
 * sent a file" and "I'm rolling out with it on the bars". Google renders these
 * as a step list, and it is the shape an assistant reuses verbatim when asked
 * "how do I follow a club ride GPX on my phone".
 */
const STEPS = [
  {
    name: "Download the organiser's GPX",
    text: "Save the GPX file from the club email, WhatsApp group or event website to your phone. Any GPX works — Komoot, Strava, Ride with GPS, Garmin Connect or a hand-drawn club file.",
  },
  {
    name: "Import it into Hodora",
    text: "Open Hodora and drop the file in. The route appears on a cycling map with distance, total climbing and an elevation profile. Nothing is uploaded and no account is required.",
  },
  {
    name: "Check the route the night before",
    text: "Scroll the elevation profile to see where the climbing is, read the cue sheet, and check the weather and wind forecast for the departure time.",
  },
  {
    name: "Save it for offline use",
    text: "Tap save-for-offline so the route and the surrounding map tiles are stored on the device. Club routes tend to find the exact lanes where mobile coverage disappears.",
  },
  {
    name: "Start navigation at the meeting point",
    text: "Mount the phone on the bars and start navigating. You get distance to the next turn, spoken turn announcements, the grade of the climb you are on, and an alert if you come off the course.",
  },
];

const LEADER_TIPS = [
  {
    title: "Send the GPX, not a screenshot",
    body: "A map image tells nobody where to turn. Export the route as GPX from whatever planner you used and attach the file — every navigation app, head unit and phone can read it.",
  },
  {
    title: "Send it the day before, not at the start",
    body: "Riders need a moment to import the route and download offline maps while they still have wifi. A file dropped in the group chat as everyone clips in guarantees half the group rides on someone else's wheel and hopes.",
  },
  {
    title: "Share a link the whole group can open",
    body: "Hodora can generate a share link for a saved route, so you send one URL and everyone opens the same course — including riders who have never used the app before.",
  },
  {
    title: "Name the route properly",
    body: '"Sunday 95k — Cafe at Little Barrow" beats "route_final_v3.gpx". The name shows up in everyone\'s ride list and in the navigation screen.',
  },
  {
    title: "Agree the regroup points",
    body: "Navigation keeps everyone on course, but a route with a split in it needs a plan. Mark the café and the top of the main climb as regroup points in the ride briefing.",
  },
];

const FAQS: FaqItem[] = [
  {
    question: "How do I follow my club's GPX route on my phone?",
    answer:
      "Download the GPX file the organiser sent, open Hodora, and import it. The route loads onto a cycling map with distance and elevation, you save it for offline use, and then start navigation at the meeting point for turn-by-turn directions with spoken turn prompts and off-route alerts. It takes about a minute and does not need an account.",
  },
  {
    question: "What is the best bike navigation app for club rides?",
    answer:
      "For club rides the deciding feature is GPX import, because that is how routes are shared. Hodora is a free bike navigation app built specifically for that workflow: import the organiser's GPX, save the route and its map tiles offline before you leave, and follow it turn by turn with alerts if you drop off course.",
  },
  {
    question: "Do I need a bike computer for a club ride or sportive?",
    answer:
      "No. Your phone has the same GPS and a much better map screen. With a handlebar mount and a navigation app that reads GPX, a phone does everything a head unit does on a club run — turn prompts, distance to go, elevation ahead and off-route warnings — without the hardware cost.",
  },
  {
    question: "What happens if I miss a turn on a group ride?",
    answer:
      "Hodora notices within a few seconds and alerts you that you are off route, then works out a way back to the nearest point on the course over real roads and cycle paths. You can also see the full cue sheet at any time to work out where the group will be.",
  },
  {
    question: "Will navigation keep working where there's no phone signal?",
    answer:
      "Yes, if you save the route for offline use before you set off. Hodora stores the GPX and the map tiles around the route on your device, so navigation, the map, the elevation profile and the cue sheet all keep working with no coverage. GPS itself does not need a mobile signal.",
  },
  {
    question: "Can everyone in the group use the same route?",
    answer:
      "Yes. The ride leader can share a saved route as a link, and every rider opens the same course on their own phone. Alternatively the organiser sends the GPX file and each rider imports it — either way the whole group navigates identical turns.",
  },
  {
    question: "Does it work for sportives and gran fondos too?",
    answer:
      "Yes. Sportives, gran fondos, audax and charity rides all publish GPX files, and they are exactly the events where a wrong turn is expensive. Import the official GPX, save it offline, and you have the full course with turn-by-turn navigation regardless of how well the junctions are marshalled.",
  },
];

export const Route = createFileRoute("/club-rides")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/club-rides") },
      { name: "twitter:card", content: "summary_large_image" },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How to navigate a club ride GPX on your phone",
          description:
            "Follow a cycling club's GPX route turn by turn on a phone, with offline maps and off-route alerts.",
          totalTime: "PT5M",
          tool: [
            { "@type": "HowToTool", name: "A smartphone with a handlebar mount" },
            { "@type": "HowToTool", name: "The ride organiser's GPX file" },
          ],
          step: STEPS.map((step, index) => ({
            "@type": "HowToStep",
            position: index + 1,
            name: step.name,
            text: step.text,
            url: `${absoluteUrl("/club-rides")}#step-${index + 1}`,
          })),
        },
      },
      {
        "script:ld+json": breadcrumbJsonLd([
          { name: "Bike navigation for club rides", path: "/club-rides" },
        ]),
      },
      { "script:ld+json": faqJsonLd(FAQS) },
    ],
    links: canonicalLink("/club-rides"),
  }),
  component: ClubRidesPage,
});

function ClubRidesPage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          Club rides &middot; Sportives &middot; Group rides
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          Bike navigation for{" "}
          <span className="font-serif font-normal italic text-rust">club rides</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Someone in the group has the route. Everyone else follows a wheel and hopes there's no
          split at the roundabout. Hodora puts the club's GPX on every rider's phone with real
          turn-by-turn navigation — free, offline-capable, and with no subscription for anyone to
          sign up to first.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Import your club's GPX
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/plan">Plan this week's route</Link>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="how-to">
          <h2 id="how-to" className="text-2xl font-bold sm:text-3xl">
            How to navigate a club ride GPX on your phone
          </h2>
          <ol className="mt-8 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.name} id={`step-${index + 1}`} className="surface flex gap-4 p-6">
                <span
                  aria-hidden="true"
                  className="font-mono text-2xl font-bold leading-none text-rust"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-base font-bold">{step.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-20" aria-labelledby="why-groups">
          <h2 id="why-groups" className="text-2xl font-bold sm:text-3xl">
            Why group rides break down without it
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              A club run splits for entirely ordinary reasons: a red light catches half the group, a
              puncture strands two riders, a fast group turns off a junction early. The moment that
              happens, everyone who was following a wheel is riding blind — and the rider with the
              route is somewhere up the road.
            </p>
            <p>
              When every rider has the same course on their own phone, none of that matters. The
              dropped pair navigate to the café themselves. The rider who took the wrong turn gets
              an off-route alert within seconds and a way back. Nobody has to ring the ride leader
              from a lay-by to ask which way the route went.
            </p>
            <p>
              The same is true at a sportive or gran fondo, where the course is published as a GPX
              weeks ahead and the junction marshalling is only as good as the volunteer rota on the
              day. Import the official file, save it offline, and you have the whole course
              regardless.
            </p>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="leaders">
          <h2 id="leaders" className="text-2xl font-bold sm:text-3xl">
            For ride leaders and event organisers
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Five habits that get a whole group navigating the same course without a pre-ride
            tutorial.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {LEADER_TIPS.map((tip) => (
              <section key={tip.title} className="surface p-6">
                <h3 className="text-base font-bold">{tip.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tip.body}</p>
              </section>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Planning the route yourself? The{" "}
            <Link to="/plan" className="underline underline-offset-2 hover:text-foreground">
              bike route planner
            </Link>{" "}
            builds it over real roads and paths, and the{" "}
            <Link to="/wind" className="underline underline-offset-2 hover:text-foreground">
              wind planner
            </Link>{" "}
            will tell you which direction to send the group first so the tailwind comes on the way
            home.
          </p>
        </section>

        <FaqSection heading="Club ride navigation FAQ" items={FAQS} />
      </article>
    </MarketingLayout>
  );
}
