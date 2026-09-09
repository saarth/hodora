import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Minus, Monitor, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AndroidIcon,
  ANDROID_RELEASES_URL,
  AppleIcon,
  MarketingLayout,
} from "@/components/MarketingLayout";
import { absoluteUrl, breadcrumbJsonLd, canonicalLink } from "@/lib/seo";

const TITLE = "How to Use Hodora — Free Bike Navigation, Start to Finish | Hodora";
const DESCRIPTION =
  "The complete guide to Hodora: install it on Android or run it in any browser on iPhone, import a GPX, plan or explore a route, save it offline, and ride it turn by turn.";

/**
 * The one guide.
 *
 * This page replaces eight separate topic pages (`/bike-navigation-app`,
 * `/turn-by-turn-navigation`, `/offline-navigation`,
 * `/bike-computer-alternative`, `/gpx-routes`, `/elevation-tracking`,
 * `/club-rides`, `/gps-cycling-app`), which now 301 here. Their substance is
 * kept — the offline split, the head-unit comparison, the club-ride advice —
 * but as sections of one walkthrough a rider reads once, rather than eight
 * pages that each restate the app's premise before getting to their point.
 *
 * Questions live on `/faq`, not here. One FAQ page with one `FAQPage` graph
 * beats nine competing ones.
 */
export const Route = createFileRoute("/how-to-use")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/how-to-use") },
      {
        "script:ld+json": breadcrumbJsonLd([{ name: "How to use Hodora", path: "/how-to-use" }]),
      },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "How to navigate a bike route with Hodora",
          description: DESCRIPTION,
          url: absoluteUrl("/how-to-use"),
          totalTime: "PT10M",
          supply: [{ "@type": "HowToSupply", name: "A GPX file of the route" }],
          tool: [{ "@type": "HowToTool", name: "An Android phone, an iPhone, or any browser" }],
          step: stepSchema(),
        },
      },
    ],
    links: canonicalLink("/how-to-use"),
  }),
  component: HowToUsePage,
});

const PLATFORMS = [
  {
    icon: AndroidIcon,
    title: "Android",
    body: "Install the app from GitHub Releases. It is the same app as the website in a native shell, and it is the better way to ride: Android lets a running app keep reading GPS with the screen off, so navigation carries on if you pocket the phone.",
    action: { label: "Get the Android app", href: ANDROID_RELEASES_URL },
  },
  {
    icon: AppleIcon,
    title: "iPhone & iPad",
    body: "No App Store build yet, and none is needed to ride. Open Hodora in Safari, tap Share, then Add to Home Screen, and it launches full-screen with its own icon — offline routes and all. Read the note below before your first ride.",
  },
  {
    icon: Monitor,
    title: "Desktop",
    body: "Any modern browser. The natural place to plan a route on a big map midweek, then sign in on the phone at the weekend and find it already there.",
  },
];

const STEPS = [
  {
    id: "get-a-route",
    name: "Get a route into Hodora",
    text: "Import the GPX your club or organiser sent, plan one on the map, or find one near you. All three end up in the same place.",
  },
  {
    id: "check-it",
    name: "Look it over before you go",
    text: "Check the elevation profile, the total climbing and the cue sheet, so nothing on the route is a surprise at kilometre 60.",
  },
  {
    id: "save-offline",
    name: "Save it for offline",
    text: "Download the route and the map tiles around it the night before, so navigation survives the parts of the ride with no signal.",
  },
  {
    id: "ride-it",
    name: "Ride it turn by turn",
    text: "Follow live navigation with distance to the next turn, spoken announcements, the grade ahead and an alert the moment you drift off course.",
  },
];

/** The HowTo graph and the rendered <ol> read the same array — see seo.ts. */
function stepSchema() {
  return STEPS.map((step) => ({
    "@type": "HowToStep",
    name: step.name,
    text: step.text,
    url: absoluteUrl(`/how-to-use#${step.id}`),
  }));
}

const ROUTE_SOURCES = [
  {
    title: "Import a GPX",
    to: "/rides" as const,
    linkLabel: "Open my rides",
    body: "Tap Import GPX, or drag the file onto the page. Files from Komoot, Strava, Ride with GPS, Garmin Connect, Cycle.travel and club websites all work — Hodora reads standard GPX tracks and routes. Parsing happens on your own device, so importing works with no signal and nothing is uploaded to read the file.",
  },
  {
    title: "Plan one on the map",
    to: "/plan" as const,
    linkLabel: "Open the planner",
    body: "Tap points on the map and Hodora routes between them over real roads and paths using OpenStreetMap data, with a bike profile and elevation. Save it and it becomes a ride like any other.",
  },
  {
    title: "Find one near you",
    to: "/explore" as const,
    linkLabel: "Explore near me",
    body: "Explore pulls cycle routes and trails around you from OpenStreetMap, or generates a loop of roughly the distance you ask for when you just want somewhere new to ride.",
  },
];

const OFFLINE_SPLIT = {
  works: [
    "Turn-by-turn navigation along the saved route",
    "The map, from the tiles saved with the route",
    "The elevation profile and the cue sheet",
    "Spoken turn announcements, via your phone's own speech",
    "Importing a GPX and viewing it",
    "Recording a ride",
  ],
  needs: [
    "Downloading the map tiles in the first place",
    "The weather, wind and rain alerts",
    "Planning a new route or searching for a place",
    "Explore's search for nearby routes",
    "Syncing to your account or to Nextcloud",
  ],
};

const LEADER_TIPS = [
  {
    title: "Send the GPX, not a screenshot",
    body: "A file every rider can import beats a picture of a map. Attach it to the ride email or drop it in the group chat the day before, so nobody is downloading anything at the meeting point.",
  },
  {
    title: "Ask everyone to save it offline",
    body: "One line in the ride email — open it, hit save for offline — means the group still has navigation in the valley where the signal goes.",
  },
  {
    title: "Name the file properly",
    body: '"Sunday club run 92km" tells a rider what they have opened. "route_final_v3.gpx" does not, and it is the name they will be scrolling past on the bars.',
  },
  {
    title: "Let the group navigate itself",
    body: "When every rider has the course, a split at a red light or a puncture stops being a problem — the dropped pair navigate to the café on their own, and a wrong turn raises an off-route alert within seconds instead of a phone call from a lay-by.",
  },
];

function HowToUsePage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          The complete guide &middot; About 10 minutes
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          How to use <span className="font-serif font-normal italic text-rust">Hodora</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          From a GPX sitting in your inbox to turn-by-turn directions on the bars. Everything is on
          this page — getting the app, loading a route, saving it for offline, and riding it — and
          none of it needs an account or a bike computer.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Import your first route
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/faq">Questions, answered</Link>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="install">
          <h2 id="install" className="text-2xl font-bold sm:text-3xl">
            Getting Hodora on your phone
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Hodora is a web app first, so it runs in any modern browser — iPhone included. Android
            additionally gets an installable native build. There is nothing to pay for on any of
            them.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {PLATFORMS.map((platform) => (
              <section key={platform.title} className="surface flex flex-col p-6">
                <platform.icon className="size-5 text-primary" />
                <h3 className="mt-4 text-base font-bold">{platform.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {platform.body}
                </p>
                {platform.action && (
                  <Button asChild variant="outline" size="sm" className="mt-4 self-start">
                    <a href={platform.action.href} target="_blank" rel="noreferrer">
                      {platform.action.label}
                    </a>
                  </Button>
                )}
              </section>
            ))}
          </div>
          <div className="surface mt-4 border-l-2 border-l-rust p-6">
            <h3 className="flex items-center gap-2 text-base font-bold">
              <Smartphone className="size-4 text-rust" />
              If you ride with an iPhone, read this first
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              iOS suspends a web page's GPS as soon as you leave the app or lock the screen, so
              navigation only follows you while Hodora is open and the display is on. Hodora holds a
              screen wake lock while you navigate, which iOS honours from 16.4 onwards, so it will
              not sleep on its own mid-ride. But if you lock the phone and pocket it, tracking
              pauses and resumes when you wake it. Android has no such restriction, which is the
              honest reason the Android app exists. Everything else — offline routes, the map, the
              cue sheet, voice announcements — behaves the same on both.
            </p>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="steps">
          <h2 id="steps" className="text-2xl font-bold sm:text-3xl">
            The ride, start to finish
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Four steps. The only thing you need to begin is the file the organiser already sent you.
          </p>
          <ol className="mt-8 space-y-4">
            {STEPS.map((step, index) => (
              <li key={step.id} id={step.id} className="surface flex scroll-mt-8 gap-4 p-6">
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

        <section className="mt-20" aria-labelledby="routes">
          <h2 id="routes" className="text-2xl font-bold sm:text-3xl">
            Step 1 — three ways to get a route in
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {ROUTE_SOURCES.map((source) => (
              <section key={source.title} className="surface flex flex-col p-6">
                <h3 className="text-base font-bold">{source.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {source.body}
                </p>
                <Link
                  to={source.to}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-2"
                >
                  {source.linkLabel}
                  <ArrowRight className="size-3.5" />
                </Link>
              </section>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Imported routes keep their own name and land in your library, where you can tag them,
            filter by surface or difficulty, and export them back out as GPX whenever you want the
            file again. Signed out, everything stays on the device; sign in and the same library
            follows you to your other devices.
          </p>
        </section>

        <section className="mt-20" aria-labelledby="check-the-route">
          <h2 id="check-the-route" className="text-2xl font-bold sm:text-3xl">
            Step 2 — read the route before you ride it
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              Opening a ride gives you its whole shape: the course on a cycling map, an elevation
              profile you can scrub along, total ascent and descent, and a cue sheet listing every
              turn with street names wherever the route data carries them.
            </p>
            <p>
              Ascent is measured from the elevation data in the file itself, which is why two apps
              can report different climbing for the same ride — they smooth the same noisy barometer
              and SRTM samples differently. If a GPX arrives with no elevation data at all, the
              profile is flat because there is genuinely nothing in the file to draw; the distance
              and the turns are unaffected.
            </p>
            <p>
              Two minutes here the night before is what turns an unknown route into a ride you have
              already seen once.
            </p>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="offline">
          <h2 id="offline" className="text-2xl font-bold sm:text-3xl">
            Step 3 — save it for offline
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            On the ride page, choose Save for offline. Hodora stores the route on the device and
            downloads the map tiles along it, telling you roughly how much space they need before it
            starts. Delete them again after the ride from the same place. GPS itself never needed a
            signal — a phone gets its position from the satellites directly — so what the download
            buys you is the map and the routing data around the course.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <section className="surface p-6">
              <h3 className="flex items-center gap-2 text-base font-bold">
                <Check className="size-4 text-primary" />
                Works with no signal
              </h3>
              <ul className="mt-4 space-y-2">
                {OFFLINE_SPLIT.works.map((item) => (
                  <li
                    key={item}
                    className="border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
            <section className="surface p-6">
              <h3 className="flex items-center gap-2 text-base font-bold">
                <Minus className="size-4 text-rust" />
                Needs a connection
              </h3>
              <ul className="mt-4 space-y-2">
                {OFFLINE_SPLIT.needs.map((item) => (
                  <li
                    key={item}
                    className="border-l-2 border-border pl-3 text-sm leading-relaxed text-muted-foreground"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="ride">
          <h2 id="ride" className="text-2xl font-bold sm:text-3xl">
            Step 4 — riding it
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Tap Navigate and mount the phone where you can see it. The navigation screen keeps the
            distance to go, the climbing left, the current grade, elapsed time, speed and your ETA
            on screen, over the map and the elevation profile.
          </p>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              <strong className="font-semibold text-foreground">Turn prompts.</strong> Turns come
              from the route's own geometry, so a GPX with no embedded directions still gets them.
              For an imported track you can recover real street names by re-routing it, which turns
              "right in 200 m" into "right in 200 m onto Mill Lane".
            </p>
            <p>
              <strong className="font-semibold text-foreground">Voice announcements.</strong> Toggle
              the speaker on the navigation screen. It uses the speech built into your phone rather
              than a cloud service, so announcements keep working with no signal.
            </p>
            <p>
              <strong className="font-semibold text-foreground">Off-route alerts.</strong> Drift off
              the course and you hear about it within seconds, along with guidance back to the point
              where you left it — not ten minutes and one wrong valley later.
            </p>
            <p>
              <strong className="font-semibold text-foreground">The screen stays on.</strong> Hodora
              holds a wake lock while navigating and takes it again when you come back to the app,
              so the display does not lock at the wrong roundabout.
            </p>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="club-rides">
          <h2 id="club-rides" className="text-2xl font-bold sm:text-3xl">
            Club rides, sportives and group events
          </h2>
          <div className="mt-6 max-w-3xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              A club run splits for entirely ordinary reasons: a red light catches half the group, a
              puncture strands two riders, the fast group turns off a junction early. When every
              rider has the same course on their own phone, none of that matters — and at a sportive
              or gran fondo, where the course is published weeks ahead and junction marshalling is
              only as good as the volunteer rota on the day, the official GPX saved offline is the
              whole course regardless.
            </p>
          </div>
          <h3 className="mt-8 text-lg font-bold">For ride leaders and organisers</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {LEADER_TIPS.map((tip) => (
              <section key={tip.title} className="surface p-6">
                <h4 className="text-base font-bold">{tip.title}</h4>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{tip.body}</p>
              </section>
            ))}
          </div>
          <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
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

        <section className="mt-20" aria-labelledby="vs-head-unit">
          <h2 id="vs-head-unit" className="text-2xl font-bold sm:text-3xl">
            Using a phone instead of a bike computer
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Short version: the phone has the same satellites, a better screen and nothing to buy;
            the head unit is waterproof, has buttons you can hit in winter gloves, and reads the
            power meter Hodora cannot. The row-by-row comparison, the mount and battery advice, and
            the cases where you should keep the head unit are all on{" "}
            <Link to="/bike-gps" className="underline underline-offset-2 hover:text-foreground">
              using your phone as a bike GPS
            </Link>
            .
          </p>
        </section>

        <section className="mt-20" aria-labelledby="the-rest">
          <h2 id="the-rest" className="text-2xl font-bold sm:text-3xl">
            The rest of Hodora
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <section className="surface p-6">
              <h3 className="text-base font-bold">
                <Link to="/record" className="hover:text-primary">
                  Record a ride
                </Link>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Ride first, route later. Recording captures distance, elapsed time, elevation and
                speed from GPS — with a manual pause rather than auto-pause — and saves the result
                as a route you can export, share or ride again.
              </p>
            </section>
            <section className="surface p-6">
              <h3 className="text-base font-bold">
                <Link to="/wind" className="hover:text-primary">
                  Pick your hour with wind
                </Link>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The wind planner scores your saved routes against the hourly forecast and shows the
                tailwind and headwind mix for each hour ahead, so you can leave at the time that
                gives you the easier way home.
              </p>
            </section>
            <section className="surface p-6">
              <h3 className="text-base font-bold">
                <Link to="/auth" className="hover:text-primary">
                  An account, if you want one
                </Link>
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Everything above works signed out. Signing in syncs your library across devices and
                lets you connect Nextcloud to keep the GPX files in storage you control. Google
                Drive and OneDrive are built but not switched on yet.
              </p>
            </section>
          </div>
        </section>

        <section className="mt-20 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Start with your first GPX
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/faq">Read the FAQ</Link>
          </Button>
        </section>
      </article>
    </MarketingLayout>
  );
}
