import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Battery, Check, Minus, Route as RouteIcon, Satellite } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ANDROID_RELEASES_URL, AndroidIcon, MarketingLayout } from "@/components/MarketingLayout";
import { absoluteUrl, appJsonLd, breadcrumbJsonLd, canonicalLink } from "@/lib/seo";

const TITLE = "Use Your Phone as a Bike GPS — Free Cycling GPS Computer | Hodora";
const DESCRIPTION =
  "Your phone already has the GPS receiver a bike computer has. Hodora turns it into a free cycling GPS: GPX routes, turn-by-turn directions and offline maps, with no head unit to buy.";

/**
 * The page that owns the *device* question.
 *
 * `/how-to-use` is the walkthrough — install it, import a GPX, ride it. This
 * page is the argument that comes before that: whether a phone can be the
 * bike GPS at all. It exists as its own page rather than a section because
 * the queries behind it ("bike gps", "cycling gps", "gps bike computer") are
 * shopping queries, not how-do-I queries — a rider deciding whether to spend
 * £300 on a head unit does not want the fourth section of an app manual.
 *
 * It is deliberately the *only* page making that argument: the comparison
 * that used to sit under `/how-to-use#vs-head-unit` moved here, and that page
 * now links across rather than restating it. Two pages arguing the same case
 * is what the eight-topic-page consolidation existed to stop, so if this page
 * grows a section, take it from somewhere rather than adding it twice.
 *
 * Every number here is pinned by `src/marketing-claims.test.ts` — the honest
 * losses (no ANT+/Bluetooth sensors, not waterproof, no gloved buttons) are
 * load-bearing, not hedging. A comparison a rider can catch out is worth less
 * than no comparison at all.
 */
const FEATURES = [
  "GPX import from any route planner",
  "Turn-by-turn cycling navigation with voice announcements",
  "Off-route alerts and routed rejoin guidance",
  "Offline maps and offline routes",
  "Live speed, distance, elapsed time, grade and climbing remaining",
  "Low-power mode for all-day rides",
  "Free and open source — no head unit, no subscription",
];

export const Route = createFileRoute("/bike-gps")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: absoluteUrl("/bike-gps") },
      {
        "script:ld+json": breadcrumbJsonLd([
          { name: "Your phone as a bike GPS", path: "/bike-gps" },
        ]),
      },
      {
        "script:ld+json": appJsonLd({
          path: "/bike-gps",
          description: DESCRIPTION,
          featureList: FEATURES,
        }),
      },
    ],
    links: canonicalLink("/bike-gps"),
  }),
  component: BikeGpsPage,
});

const WHAT_A_BIKE_GPS_DOES = [
  {
    icon: Satellite,
    title: "Fix your position",
    body: "Every phone sold in the last decade carries a multi-constellation GNSS receiver — the same satellites, and usually a newer chip than the head unit on the stem. It reads position from the satellites directly, so this part never needed a mobile signal.",
  },
  {
    icon: RouteIcon,
    title: "Hold the route",
    body: "A bike GPS is only useful if it can carry the course you were sent. Hodora imports a standard GPX from Komoot, Strava, Ride with GPS, Garmin Connect or a club's own website, parses it on the device, and keeps it in your library.",
  },
  {
    icon: ArrowRight,
    title: "Call the next turn",
    body: "Turns come from the route's own geometry — a bearing change past about 35 degrees — so a bare GPX with no embedded instructions still yields a full cue sheet, spoken prompts and a distance to the next turn.",
  },
  {
    icon: Battery,
    title: "Last the ride",
    body: "Low-power mode drops the GPS chip out of high-accuracy mode and cuts the weather refresh from every minute to every five, the two biggest drains on a long day. Saved routes and tiles mean it isn't holding a data connection either.",
  },
];

/**
 * The comparison, as data rather than prose.
 *
 * `phone`/`headUnit` are `true` (has it), `false` (doesn't) or a string for
 * the cases where a tick would be a lie — the rows a rider would otherwise
 * catch us on are exactly the ones worth spelling out.
 */
const COMPARISON: Array<{
  feature: string;
  phone: boolean | string;
  headUnit: boolean | string;
  note: string;
}> = [
  {
    feature: "Cost to start",
    phone: "Free",
    headUnit: "£150–£600",
    note: "Hodora is free and open source; the phone is already in your pocket.",
  },
  {
    feature: "Routing subscription",
    phone: "None",
    headUnit: "Often annual",
    note: "Maps and routing come from OpenStreetMap, with no tier to unlock.",
  },
  {
    feature: "GNSS receiver",
    phone: true,
    headUnit: true,
    note: "The same satellites, and the phone's chip is usually the newer one.",
  },
  {
    feature: "Turn-by-turn from a GPX",
    phone: true,
    headUnit: true,
    note: "Detected from route geometry, with optional spoken announcements.",
  },
  {
    feature: "Offline maps",
    phone: true,
    headUnit: true,
    note: "Save the route before you leave and its map corridor comes with it.",
  },
  {
    feature: "Screen",
    phone: "Larger, colour",
    headUnit: "Smaller",
    note: "A phone screen is brighter and denser than any head unit at the price.",
  },
  {
    feature: "Readable in rain",
    phone: false,
    headUnit: true,
    note: "A wet touchscreen mis-reads taps; head unit buttons do not care.",
  },
  {
    feature: "Waterproof",
    phone: "Case needed",
    headUnit: true,
    note: "Most head units are IPX7 as sold. Phones want a mount with a cover.",
  },
  {
    feature: "Gloved buttons",
    phone: false,
    headUnit: true,
    note: "Physical buttons win every time in winter gloves.",
  },
  {
    feature: "Power meter / heart rate",
    phone: false,
    headUnit: true,
    note: "Hodora does not read ANT+ or Bluetooth sensors. This one is real.",
  },
  {
    feature: "Battery for an all-day ride",
    phone: "With low-power mode",
    headUnit: true,
    note: "A head unit runs longer; a phone has the bigger battery and a power bank fits in a jersey pocket.",
  },
];

const ON_THE_BARS = [
  {
    title: "Mount it properly",
    body: "An out-front mount that clamps the phone at four corners, not a rubber-strap holder or a stem bag with a window. A phone that moves in its mount is a phone you cannot read, and cobbles find every weak mount eventually.",
  },
  {
    title: "Save the route the night before",
    body: "Saving a route for offline use stores the GPX and the map tiles along it on the device. That is what makes the phone a bike GPS rather than a maps app — navigation, cue sheet and elevation profile all keep working with no signal.",
  },
  {
    title: "Turn on low-power mode",
    body: "In Settings, for anything over a couple of hours. It trades a little GPS precision and weather freshness for range, and it changes nothing about what is drawn on screen.",
  },
  {
    title: "Let it hold the screen awake",
    body: "Hodora takes a screen wake lock while you navigate or record, and takes it again when you come back to the app, so the display does not lock itself at the wrong roundabout. On iPhone that needs iOS 16.4 or newer.",
  },
];

function Cell({ value }: { value: boolean | string }) {
  if (value === true) {
    return (
      <>
        <Check className="size-4 text-primary" aria-hidden="true" />
        <span className="sr-only">Yes</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <Minus className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">No</span>
      </>
    );
  }
  return <span className="text-sm font-semibold">{value}</span>;
}

function BikeGpsPage() {
  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          Bike GPS &middot; Cycling GPS &middot; No head unit required
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          Your phone is already a{" "}
          <span className="font-serif font-normal italic text-rust">bike GPS</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          A GPS bike computer is a screen, a satellite receiver and a route. Your phone has the
          first two and a better version of the first. Hodora supplies the third — free, open
          source, and without the annual routing subscription a head unit expects you to keep
          paying.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="glow-ring">
            <Link to="/rides">
              Load a route and ride it
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/plan">Plan a route first</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={ANDROID_RELEASES_URL} target="_blank" rel="noreferrer">
              <AndroidIcon className="size-4" />
              Android app
            </a>
          </Button>
        </div>

        <section className="mt-20" aria-labelledby="what-it-does">
          <h2 id="what-it-does" className="text-2xl font-bold sm:text-3xl">
            What a cycling GPS actually has to do
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Four jobs. A £400 head unit does them well; so does a phone with the right app on it.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {WHAT_A_BIKE_GPS_DOES.map((item) => (
              <section key={item.title} className="surface p-6">
                <item.icon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-4 text-base font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="comparison">
          <h2 id="comparison" className="text-2xl font-bold sm:text-3xl">
            Phone versus a GPS bike computer
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The rows a head unit wins are as real as the ones it loses. If you train on power, the
            last table row is the whole argument and you should keep the head unit.
          </p>
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <caption className="sr-only">
                Hodora on a phone compared with a dedicated GPS bike computer
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="py-3 pr-4 text-sm font-bold">
                    Feature
                  </th>
                  <th scope="col" className="py-3 pr-4 text-sm font-bold">
                    Phone + Hodora
                  </th>
                  <th scope="col" className="py-3 pr-4 text-sm font-bold">
                    Bike computer
                  </th>
                  <th scope="col" className="py-3 text-sm font-bold">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b border-border/60 align-top">
                    <th scope="row" className="py-3 pr-4 text-sm font-semibold">
                      {row.feature}
                    </th>
                    <td className="py-3 pr-4">
                      <Cell value={row.phone} />
                    </td>
                    <td className="py-3 pr-4">
                      <Cell value={row.headUnit} />
                    </td>
                    <td className="py-3 text-sm leading-relaxed text-muted-foreground">
                      {row.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="on-the-bars">
          <h2 id="on-the-bars" className="text-2xl font-bold sm:text-3xl">
            Making a phone work as a bike computer
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Four things separate riders who gave up on this from riders who sold the head unit.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {ON_THE_BARS.map((item) => (
              <section key={item.title} className="surface p-6">
                <h3 className="text-base font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </section>
            ))}
          </div>
        </section>

        <section className="mt-20" aria-labelledby="who-should-not">
          <h2 id="who-should-not" className="text-2xl font-bold sm:text-3xl">
            When to keep the head unit
          </h2>
          <div className="mt-6 max-w-2xl space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              If your training is built on a power meter or a heart-rate strap, a phone running
              Hodora will not replace the unit reading them — it does not pair with ANT+ or
              Bluetooth sensors, and pretending otherwise would waste your afternoon. The same goes
              for winter racing in full gloves, where physical buttons beat a wet touchscreen, and
              for bikepacking days longer than a phone battery and a power bank will cover.
            </p>
            <p>
              Plenty of riders run both: the head unit records the numbers, the phone carries the
              route. That works, and it is cheaper than replacing a head unit whose maps
              subscription has lapsed.
            </p>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="next">
          <h2 id="next" className="text-2xl font-bold sm:text-3xl">
            Try it on the next club run
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Import the GPX the organiser already sent, save it for offline, and ride it. Nothing to
            buy and no account needed. The{" "}
            <Link to="/how-to-use" className="underline underline-offset-2 hover:text-foreground">
              full walkthrough
            </Link>{" "}
            covers installing it on Android or iPhone, and the{" "}
            <Link to="/faq" className="underline underline-offset-2 hover:text-foreground">
              FAQ
            </Link>{" "}
            answers what happens to battery, storage and your data.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="glow-ring">
              <Link to="/rides">
                Import a GPX
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/explore">Find a route near me</Link>
            </Button>
          </div>
        </section>
      </article>
    </MarketingLayout>
  );
}
