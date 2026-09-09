import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FaqSection } from "@/components/FaqSection";
import { GITHUB_URL, MarketingLayout } from "@/components/MarketingLayout";
import { absoluteUrl, breadcrumbJsonLd, canonicalLink, faqJsonLd, type FaqItem } from "@/lib/seo";

const TITLE = "Hodora FAQ — Free Bike Navigation Questions, Answered | Hodora";
const DESCRIPTION =
  "Answers about Hodora: what it costs, which phones it runs on, how it behaves on iPhone, offline navigation, GPX imports, battery, privacy and self-hosting.";

/**
 * The site's only FAQ.
 *
 * These questions used to be spread across the landing page and eight topic
 * pages, each with its own `FAQPage` graph competing for the same queries.
 * They are one list here, and one graph, built from the same array the page
 * renders — see `faqJsonLd` in seo.ts.
 *
 * Answers are written to stand on their own out of context: an LLM quoting
 * one in a "best bike navigation app" answer lifts the sentence, not the page
 * around it, so each one names Hodora and what it actually does.
 */
const BASICS: FaqItem[] = [
  {
    question: "What is the best bike navigation app for club rides?",
    answer:
      "The one that opens the file your ride leader actually sends. Club rides, sportives and gran fondos are shared as a GPX file, so the practical test for a bike navigation app is whether you can import that GPX in a few seconds and follow it turn by turn without a subscription. Hodora is built for exactly that case: import the organiser's GPX, save it for offline use before you leave, and ride it with turn prompts, a cue sheet and off-route alerts.",
  },
  {
    question: "Is there a free GPS app for cycling?",
    answer:
      "Yes. Hodora is a free, open-source GPS app for cycling with no subscription tier and no paid unlock — turn-by-turn navigation, offline maps, route planning and ride recording are all included. It runs in your phone's browser or as an installable app, and the source is on GitHub under the MIT licence.",
  },
  {
    question: "Do I need a bike computer to navigate a route?",
    answer:
      "No. A modern phone has the same GPS receiver, a far better screen and a bigger battery than most entry-level head units. Hodora turns that phone into a bike navigation device: mount it on the bars, load the route, and it gives you distance to the next turn, the grade of the climb ahead and an alert the moment you drift off course.",
  },
  {
    question: "What does a bike computer do that Hodora doesn't?",
    answer:
      "A dedicated head unit is waterproof, has physical buttons you can press in winter gloves, and pairs with power meters and heart-rate straps over ANT+ or Bluetooth. Hodora does not read those sensors. If your training runs on power data, keep the head unit for that and use Hodora for the route — plenty of riders run both.",
  },
  {
    question: "Do I need an account to use it?",
    answer:
      "No. You can import a GPX and start navigating without signing up — routes are stored on your device. An account only exists so your routes sync between your phone, tablet and desktop, and you can optionally sync them to your own Nextcloud as well.",
  },
];

const PLATFORMS: FaqItem[] = [
  {
    question: "Is Hodora available on Android and iPhone?",
    answer:
      "Both, in different ways. Hodora is a web app, so it runs in any modern browser on iPhone, iPad, Android and desktop. Android also has an installable native app published on GitHub Releases. On iPhone you add the web app to your home screen instead, which gives you the same offline-capable app without an app store.",
  },
  {
    question: "Is there an iPhone app for Hodora?",
    answer:
      "Not on the App Store, and none is needed to ride. iPhone and iPad users open Hodora in Safari, tap Share and then Add to Home Screen, and it launches full-screen with its own icon, offline routes included. An iOS build is on the list but the browser version is fully usable today.",
  },
  {
    question: "Does turn-by-turn navigation work properly on an iPhone?",
    answer:
      "It works, with one caveat worth knowing before your first ride. iOS suspends a web page's GPS as soon as you leave the app or lock the screen, so navigation only follows you while Hodora is open and the display is on. Hodora holds a screen wake lock while you navigate, which iOS honours from version 16.4, so the screen will not sleep by itself. If you lock the phone and pocket it, tracking pauses and resumes when you wake it. Android has no such restriction, which is why the Android app exists.",
  },
  {
    question: "Where do I get the Android app?",
    answer:
      "From the Releases page of the Hodora repository on GitHub, as an APK you install directly — it is not on Google Play. It is the same app as the website wrapped in a native shell, so anything synced to your account is already there when you sign in.",
  },
  {
    question: "Does it use my phone's battery quickly?",
    answer:
      "Navigation uses GPS continuously, which costs battery on any cycling GPS app. Hodora has a low-power mode that drops the GPS chip out of high-accuracy mode and polls the weather less often — the two biggest drains on a long ride — and because routes and map tiles can be stored offline it isn't spending power on mobile data the whole way round.",
  },
];

const NAVIGATING: FaqItem[] = [
  {
    question: "How does Hodora give turn-by-turn directions from a GPX file?",
    answer:
      'Turns are detected from the route\'s own geometry, so a GPX that carries no embedded directions still gets turn-by-turn navigation. For a track you imported you can additionally recover real street names by re-routing it, which upgrades "right in 200 m" to "right in 200 m onto Mill Lane".',
  },
  {
    question: "Does Hodora announce turns out loud?",
    answer:
      "Yes. Toggle the speaker on the navigation screen and Hodora announces each turn as it comes up, with the street name where the route data has one. It uses the speech built into your phone rather than a cloud service, so announcements keep working with no signal.",
  },
  {
    question: "What happens if I go off route?",
    answer:
      "You get an off-route alert within seconds of drifting from the course, plus guidance back to the point where you left it. On a group ride that turns a wrong turn into a two-minute correction rather than a phone call from a lay-by.",
  },
  {
    question: "Can I see all the turns before I set off?",
    answer:
      "Yes. Every ride has a full cue sheet listing the turns in order, with street names wherever the route data carries them, alongside the map and the elevation profile. It works offline once the route is saved.",
  },
  {
    question: "Does the screen stay on while I navigate?",
    answer:
      "Yes. Hodora holds a screen wake lock while you are navigating or recording, and reacquires it when you return to the app after switching away, so the display stays on for the whole ride instead of locking at the wrong roundabout.",
  },
];

const OFFLINE: FaqItem[] = [
  {
    question: "Does bike navigation work offline?",
    answer:
      "Yes. Save a route for offline use before you set off and Hodora stores the GPX and the map tiles around it on your device. Navigation, the elevation profile and the cue sheet all keep working with no signal, which matters on the parts of a club run where coverage disappears.",
  },
  {
    question: "Does GPS work without a mobile signal?",
    answer:
      "Yes — this is the part people most often get wrong. Your phone reads its position from the satellites directly, so GPS itself never needed a data connection. What a connection normally provides is the map imagery and the routing data, which is exactly what saving a route offline puts on the device in advance.",
  },
  {
    question: "What still needs a connection while riding?",
    answer:
      "The weather, wind and rain alerts, planning a brand-new route, searching for a place, Explore's search for routes near you, and syncing to your account or Nextcloud. Navigation along a saved route, its map, cue sheet, elevation profile, voice announcements and ride recording all work with no signal at all.",
  },
  {
    question: "How much storage do offline maps use?",
    answer:
      "It depends on the length of the route, since Hodora only downloads the tiles along it rather than a whole region. The app shows an estimate before the download starts, and you can delete a route's tiles again from the same place once the ride is done.",
  },
];

const ROUTES_AND_DATA: FaqItem[] = [
  {
    question: "Which route planners can I import GPX files from?",
    answer:
      "Any of them. Hodora reads standard GPX tracks and routes, so files exported from Komoot, Strava, Ride with GPS, Garmin Connect, Cycle.travel or a club's own website all work the same way. You can also plan a route inside Hodora and skip the export step.",
  },
  {
    question: "Where are my GPX routes stored?",
    answer:
      "On your device by default. A GPX you import is parsed locally and never uploaded just to be read, so importing works with no signal. If you sign in, your routes are also stored against your account so they sync between devices, and you can export any route back out as a GPX file whenever you want it.",
  },
  {
    question: "How is total elevation gain calculated?",
    answer:
      "From the elevation data in the route file itself, summed over the climbing sections. This is why two apps can report different climbing figures for the same ride — they smooth the same noisy barometric and SRTM samples differently. If a GPX arrives with no elevation data at all, the profile is flat because there is nothing in the file to draw; distance and turns are unaffected.",
  },
  {
    question: "Can I record a ride rather than follow one?",
    answer:
      "Yes. Recording captures distance, elapsed time, elevation and speed from GPS, with a manual pause rather than automatic auto-pause, and saves the finished ride as a route you can export, share or navigate again later.",
  },
];

const PRIVACY_AND_PROJECT: FaqItem[] = [
  {
    question: "Does Hodora track me or sell my data?",
    answer:
      "No. There are no ads, no analytics vendors and no third-party trackers wired into the app at all. Signed out, your routes never leave your device. Signed in, they are stored so they can sync between your devices, and you can delete your account and its data whenever you like.",
  },
  {
    question: "Can I keep my GPX files in my own cloud storage?",
    answer:
      "Nextcloud sync works today: connect your server in Settings and Hodora keeps your routes in a folder you control. Google Drive and OneDrive are built but not switched on yet — they need OAuth credentials that are still being set up, so they show as coming soon. If you self-host you can supply your own credentials and enable either one immediately.",
  },
  {
    question: "Can I host Hodora myself?",
    answer:
      "Yes. The repository ships a Dockerfile and a Compose file, with notes for running it on Unraid. Point the site URL environment variable at your own domain and your instance describes itself properly to search engines instead of pointing at hodora.app.",
  },
  {
    question: "How do I report a bug or request a feature?",
    answer:
      "Open an issue on GitHub. Hodora is a learn-by-doing project built in the open under the MIT licence, so bug reports, feature requests and pull requests are all genuinely welcome.",
  },
];

const SECTIONS = [
  { heading: "The basics", items: BASICS, id: "basics" },
  { heading: "Phones and platforms", items: PLATFORMS, id: "platforms" },
  { heading: "Navigating a route", items: NAVIGATING, id: "navigating" },
  { heading: "Riding offline", items: OFFLINE, id: "offline" },
  { heading: "Routes, files and data", items: ROUTES_AND_DATA, id: "routes" },
  { heading: "Privacy and the project", items: PRIVACY_AND_PROJECT, id: "project" },
];

const ALL_FAQS = SECTIONS.flatMap((section) => section.items);

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: absoluteUrl("/faq") },
      { "script:ld+json": breadcrumbJsonLd([{ name: "FAQ", path: "/faq" }]) },
      { "script:ld+json": faqJsonLd(ALL_FAQS) },
    ],
    links: canonicalLink("/faq"),
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          Bike navigation questions, answered
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          Frequently asked{" "}
          <span className="font-serif font-normal italic text-rust">questions</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          What Hodora costs, which phones it runs on, how it behaves on an iPhone, what keeps
          working with no signal, and what happens to your rides. If something is missing, ask on{" "}
          <a
            href={`${GITHUB_URL}/issues`}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            GitHub
          </a>
          .
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/how-to-use">
              Read the full guide
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/rides">Import a GPX</Link>
          </Button>
        </div>

        {SECTIONS.map((section) => (
          <FaqSection
            key={section.id}
            id={section.id}
            heading={section.heading}
            items={section.items}
          />
        ))}
      </article>
    </MarketingLayout>
  );
}
