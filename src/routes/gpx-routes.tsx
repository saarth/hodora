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

const TITLE = "GPX Route Manager — Import, Organise & Navigate GPX | Hodora";
const DESCRIPTION =
  "A free GPX viewer and route manager: import GPX files from any planner, see distance and elevation, tag and search your library, save routes offline, share them and navigate turn by turn.";

const FEATURES = [
  "GPX import from any route planner",
  "GPX viewer with map, distance, ascent and elevation profile",
  "Searchable route library with difficulty and surface tags",
  "Offline-saved and recorded-ride filters",
  "Share links for a route, with GPX download",
  "Optional sync to Nextcloud, Google Drive or OneDrive",
];

const LIFECYCLE = [
  {
    title: "Import",
    body: "Drop in a GPX from Komoot, Strava, Ride with GPS, Garmin Connect, cycle.travel or a club website. It is parsed on your phone — the file is not uploaded to be processed — and you get the route on a map with distance, total ascent and descent immediately.",
  },
  {
    title: "Organise",
    body: "Give each route difficulty and surface tags, then search your library by name or filter it down: paved or gravel, easy or hard, only the ones saved offline, only the rides you recorded yourself. A library of eighty GPX files stops being a folder of cryptic filenames.",
  },
  {
    title: "Prepare",
    body: "Read the elevation profile and the cue sheet before the ride, check the wind forecast for your departure time, and save the route and its map tiles to the device so it works with no signal.",
  },
  {
    title: "Ride",
    body: "Navigate it turn by turn with voice prompts and off-route alerts. Routes built in the planner can be reopened and edited later; recorded rides are saved back into the same library as routes you can ride again.",
  },
  {
    title: "Share and export",
    body: "Create a share link for a route and send it to the group — anyone who opens it sees the same course and can download it as a standard GPX file for their own device or app.",
  },
];

const SOURCES = [
  "Komoot",
  "Strava",
  "Ride with GPS",
  "Garmin Connect",
  "cycle.travel",
  "Bikerouter / BRouter",
  "Club and event websites",
  "Routes you plan or record in Hodora",
];

const FAQS: FaqItem[] = [
  {
    question: "What is a GPX file?",
    answer:
      "GPX is the standard open file format for GPS routes and tracks. It holds a list of coordinates, usually with elevation, and it is how cycling clubs, event organisers and route planners share routes with each other. Because it is an open format, a GPX from one tool opens in any other that supports it.",
  },
  {
    question: "How do I open and view a GPX file on my phone?",
    answer:
      "Import it into Hodora and it renders straight away as a route on a cycling map, with total distance, ascent and descent, an elevation profile and a full cue sheet of the turns. It is a free GPX viewer that runs in the browser, so there is nothing to install and no account needed to look at a file.",
  },
  {
    question: "How do I manage a library of GPX routes?",
    answer:
      "Hodora keeps every imported, planned and recorded route in one searchable library. Tag routes by difficulty and surface, search by name, and filter to just the ones you have saved offline or recorded yourself. Each route keeps its distance, climbing and map preview, so you can find the right file without opening five of them.",
  },
  {
    question: "Can I export a route as GPX again?",
    answer:
      "Yes. Create a share link for any route and the shared view offers a GPX download, so you can hand the file to a riding partner, load it onto a head unit, or take it into another app. Routes you recorded from a ride export the same way.",
  },
  {
    question: "Where are my GPX routes stored?",
    answer:
      "Signed out, entirely on your device — in the browser's own database, never sent anywhere. Signed in, they live in your account so the same library appears on your phone, tablet and desktop, and any route you save for offline use is kept on the device as well. You can also sync routes to storage you control — your own Nextcloud, Google Drive or OneDrive.",
  },
  {
    question: "Which planners can I import GPX files from?",
    answer:
      "Any tool that exports standard GPX — Komoot, Strava, Ride with GPS, Garmin Connect, cycle.travel, BRouter and club websites all work. Hodora reads both GPX tracks and routes, so a file drawn by hand on a club site imports the same as one exported from a commercial planner.",
  },
  {
    question: "Can I edit a route after importing it?",
    answer:
      "Routes you build in Hodora's planner can be reopened and edited — drag the waypoints, re-route and save. An imported GPX is a fixed track with no waypoints behind it, so it is kept as it came rather than silently reshaped; to change one, plan the new version in the planner.",
  },
];

export const Route = createFileRoute("/gpx-routes")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/gpx-routes") },
      { name: "twitter:card", content: "summary_large_image" },
      {
        "script:ld+json": appJsonLd({
          path: "/gpx-routes",
          description: DESCRIPTION,
          featureList: FEATURES,
        }),
      },
      {
        "script:ld+json": breadcrumbJsonLd([{ name: "GPX route manager", path: "/gpx-routes" }]),
      },
      { "script:ld+json": faqJsonLd(FAQS) },
    ],
    links: canonicalLink("/gpx-routes"),
  }),
  component: GpxRoutesPage,
});

function GpxRoutesPage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          GPX route management
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          Every GPX you own,{" "}
          <span className="font-serif font-normal italic text-rust">in one place</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Import GPX files from any planner and Hodora becomes a free GPX viewer and route manager:
          distance and climbing at a glance, tags and search across the library, offline saving,
          share links with GPX download, and turn-by-turn navigation when it is time to ride.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Import a GPX file
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/plan">Plan a new route</Link>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="lifecycle">
          <h2 id="lifecycle" className="text-2xl font-bold sm:text-3xl">
            The life of a route, start to finish
          </h2>
          <ol className="mt-8 space-y-4">
            {LIFECYCLE.map((stage, index) => (
              <li key={stage.title} className="surface flex gap-4 p-6">
                <span
                  aria-hidden="true"
                  className="font-mono text-2xl font-bold leading-none text-rust"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-base font-bold">{stage.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{stage.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-20" aria-labelledby="sources">
          <h2 id="sources" className="text-2xl font-bold sm:text-3xl">
            Where your GPX files can come from
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            GPX is an open format, so anything that exports it imports here. No proprietary account
            or desktop sync tool sits in between.
          </p>
          <ul className="mt-8 grid max-w-3xl gap-3 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
            {SOURCES.map((source) => (
              <li key={source} className="flex gap-2">
                <span aria-hidden="true" className="text-rust">
                  &rarr;
                </span>
                <span>{source}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-20" aria-labelledby="ownership">
          <h2 id="ownership" className="text-2xl font-bold sm:text-3xl">
            Your routes stay yours
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Imported files are parsed on your device rather than uploaded to be processed. Ride
              signed out and they go no further: the library lives in your browser's own database
              and nothing leaves the phone.
            </p>
            <p>
              Signing in puts that library in your account so it follows you across phone, tablet
              and desktop, with anything you save offline kept on the device too. If you would
              rather not put it in this app's database at all, routes can sync to storage you
              control — a Nextcloud server, Google Drive or OneDrive — and the whole app can be
              self-hosted, since it is open source under the MIT licence.
            </p>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Once a route is in the library, see{" "}
            <Link
              to="/elevation-tracking"
              className="underline underline-offset-2 hover:text-foreground"
            >
              elevation tracking
            </Link>{" "}
            for what it tells you about the climbing, and{" "}
            <Link
              to="/turn-by-turn-navigation"
              className="underline underline-offset-2 hover:text-foreground"
            >
              turn-by-turn navigation
            </Link>{" "}
            for riding it.
          </p>
        </section>

        <FaqSection heading="GPX route management FAQ" items={FAQS} />
      </article>
    </MarketingLayout>
  );
}
