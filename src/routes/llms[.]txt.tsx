import { createFileRoute } from "@tanstack/react-router";

import { SITE_URL } from "@/lib/seo";

/**
 * `/llms.txt` — the emerging convention (llmstxt.org) for handing a language
 * model a clean, plain-text map of a site instead of making it infer one from
 * rendered HTML.
 *
 * Worth having here specifically because most of this app is a client-rendered
 * map UI: `/plan` and `/explore` set `ssr: false`, so a crawler that doesn't
 * execute JavaScript sees their metadata and nothing else. This file states
 * plainly what those pages do.
 *
 * A route rather than a file in `public/` for the same reason robots.txt and
 * sitemap.xml are: the URLs have to follow VITE_SITE_URL so a self-hosted
 * instance describes itself rather than hodora.app.
 */
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: () => {
        return new Response(
          `# Hodora

> Hodora is a free, open-source bike navigation app and GPS app for cycling.
> It runs in a phone browser or as an installable app (PWA / Android), imports
> GPX routes from any planner, and provides turn-by-turn cycling navigation
> with voice prompts, off-route alerts, offline maps and live weather. There is
> no subscription, no paid tier, no ads and no tracking. Source: MIT licence.

## What it is for

- Following a club ride, sportive or event route sent as a GPX file, on a phone
  instead of a dedicated bike computer.
- Planning a cycle route over real roads and paths (OpenStreetMap data via
  BRouter/OSRM) and then navigating it.
- Recording a ride from the phone's GPS: distance, elapsed time (with manual
  pause/resume), speed and elevation gain.
- Riding where there is no mobile signal, using routes and map tiles saved to
  the device beforehand.

## Key facts

- Price: free. No subscription, no in-app purchase, no ad-supported tier.
- Licence: MIT, open source at https://github.com/saarth/hodora
- Platforms: any modern browser, installable as a PWA (including iOS), plus an
  Android app published on GitHub Releases.
- Account: optional. Routes work without signing in; an account only syncs them
  across your own devices. Optional sync to your own Nextcloud, Google Drive or
  OneDrive.
- Data: maps and routing from OpenStreetMap, weather from Open-Meteo. No
  analytics trackers, no data sale.
- Self-hosting: supported (Docker / Node server), documented in the README.

## Features

- GPX import from Komoot, Strava, Ride with GPS, Garmin Connect or any other
  source that exports standard GPX.
- Turn-by-turn navigation: distance to the next turn, turn prompts, current
  grade, full cue sheet, optional spoken announcements. Turns are detected from
  the route's own geometry (a bearing change past ~35 degrees), so a plain GPX
  yields a full cue sheet; street names are an optional on-demand step that
  re-routes an imported track through OSRM to attach them.
- Off-route alerts with routed rejoin guidance back to the course.
- Elevation: profile per route, total ascent/descent (a 0.5 m noise threshold
  throughout, plus a moving-average smoothing pass on raw GPS altitude from
  imported GPX and recorded rides), live average grade over the next 200 m,
  and climbing remaining while navigating.
- Low-power mode: drops the GPS chip out of high-accuracy mode and slows the
  weather refresh; it does not change what is drawn.
- Offline maps and offline route storage: the route corridor's map tiles and
  the route itself are saved on the device, so navigation, the cue sheet and
  the elevation profile work in airplane mode. Live weather, place search and
  routed rejoin guidance are the parts that still need a connection.
- GPX route management: import from any planner, a searchable library with
  difficulty/surface tags and offline/recorded filters, share links that offer
  a GPX download, and optional sync to Nextcloud, Google Drive or OneDrive.
- Bike route planner with elevation profile and departure-time weather.
- Live weather during navigation, including a headwind/tailwind call-out and a
  warning before rain arrives.
- Nearby amenities from OpenStreetMap: cafés, drinking water, bike shops,
  toilets.
- Ride recording with speed history, saved as a reusable route.
- Wind planner: picks the best hour to ride a saved route based on the forecast.
- Light and dark themes.

## Pages

- [Home](${SITE_URL}/): what Hodora is, how to navigate a club ride GPX in four
  steps, and why a phone works in place of a bike computer.
- [Bike navigation app](${SITE_URL}/bike-navigation-app): what to look for in a
  bike navigation app and how Hodora meets each criterion.
- [Turn-by-turn navigation](${SITE_URL}/turn-by-turn-navigation): what is on
  screen while riding, how turn instructions are derived from a plain GPX, and
  how off-route alerts and rejoin guidance work.
- [Offline navigation](${SITE_URL}/offline-navigation): how offline maps and
  offline routes are stored, and precisely what does and does not work without
  a mobile signal.
- [Bike computer alternative](${SITE_URL}/bike-computer-alternative): honest
  comparison of a phone against a dedicated head unit, in both directions, plus
  how to set a phone up for the bars.
- [GPX route management](${SITE_URL}/gpx-routes): importing, viewing, tagging,
  searching, sharing and exporting GPX routes, and where they are stored.
- [Elevation tracking](${SITE_URL}/elevation-tracking): elevation profile,
  total ascent, live gradient, and how elevation gain is smoothed and
  thresholded so GPS noise doesn't inflate it.
- [Bike navigation for club rides](${SITE_URL}/club-rides): step-by-step guide
  for riders following a club or event GPX, plus guidance for ride leaders.
- [Free GPS app for cycling](${SITE_URL}/gps-cycling-app): ride recording,
  navigation, GPS accuracy, battery and what "free" means here.
- [Bike route planner](${SITE_URL}/plan): plan a cycle route by tapping the map.
  Client-rendered map UI.
- [Explore cycle routes near me](${SITE_URL}/explore): find nearby bike trails
  and routes from OpenStreetMap, or generate a loop of a chosen distance.
  Client-rendered map UI.
- [Wind planner](${SITE_URL}/wind): tailwind/headwind forecast for a saved route.

## Optional

- [Source code](https://github.com/saarth/hodora)
- [Android releases](https://github.com/saarth/hodora/releases)
- [Sitemap](${SITE_URL}/sitemap.xml)
`,
          {
            status: 200,
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          },
        );
      },
    },
  },
});
