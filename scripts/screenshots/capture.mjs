/**
 * Captures the app-store / listing screenshots (Product Hunt, AlternativeTo,
 * README) by driving the real app in a real browser.
 *
 * Nothing here fakes the UI: the app runs from source, the map is MapLibre
 * drawing `cycling-style.ts`, the charts are the app's charts. What is faked
 * is only what a screenshot run can't get for free — the account, the rides,
 * the rider's GPS position, and the third-party APIs (see `stubs.mjs`).
 *
 *   node scripts/screenshots/capture.mjs [--only=name,name] [--out=dir]
 *                                        [--base-url=http://127.0.0.1:8080]
 *                                        [--stub-tiles|--real-tiles]
 *
 * Tiles come from the real provider when it's reachable; otherwise the run
 * falls back to a generated stand-in basemap so it still works offline (see
 * `world.mjs` / `tiles.mjs`).
 */

import { chromium, devices } from "playwright";
import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { buildWorld } from "./world.mjs";
import { buildDemoRides, demoProfile } from "./rides.mjs";
import { createTileSource, createGlyphSource } from "./tiles.mjs";
import { installStubs, session } from "./stubs.mjs";
import { createFontStylesheet } from "./fonts.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);

const BASE_URL = args["base-url"] ?? "http://127.0.0.1:8080";
const OUT_DIR = path.resolve(args.out ?? "screenshots");
const SUPABASE_URL = "https://demo-hodora.supabase.co";
const TILE_HOST = "tiles.openfreemap.org";

const log = (message) => console.log(`  ${message}`);

/** Viewports the listings want: a phone for the store galleries, a laptop for the web app. */
const DEVICE_PROFILES = {
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["Pixel 7"].userAgent,
  },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reachable(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Whether the browser itself can open a URL. `no-cors` keeps a cross-origin
 * response from throwing, so a rejection here means the request never made it
 * off the machine rather than that the answer wasn't readable.
 */
async function browserReachable(browser, url) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    return await page.evaluate(
      (target) =>
        fetch(target, { mode: "no-cors" }).then(
          () => true,
          () => false,
        ),
      url,
    );
  } catch {
    return false;
  } finally {
    await context.close();
  }
}

/** Uses an already-running dev server when there is one, otherwise starts its own. */
async function ensureDevServer() {
  if (await reachable(BASE_URL)) {
    log(`using the dev server already on ${BASE_URL}`);
    return null;
  }
  log(`starting a dev server on ${BASE_URL}`);
  const url = new URL(BASE_URL);
  const child = spawn(
    "npx",
    ["vite", "dev", "--host", url.hostname, "--port", url.port || "8080"],
    {
      stdio: "ignore",
      detached: false,
    },
  );
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    if (await reachable(BASE_URL)) return child;
  }
  child.kill();
  throw new Error(`dev server did not come up on ${BASE_URL}`);
}

/**
 * Replaces the browser's geolocation with a rider moving along `track`, so
 * the navigation and recording screens show a ride in progress rather than a
 * "waiting for GPS" state. Playwright's own geolocation can't do speed or
 * heading, which is most of what those screens display.
 */
function riderScript({ track, startIndex = 0, cruiseKmh = 26 }) {
  return `(() => {
    const track = ${JSON.stringify(track)};
    let cursor = ${startIndex};

    const metres = (a, b) => {
      const dLat = (b.lat - a.lat) * 111320;
      const dLon = (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
      return Math.hypot(dLat, dLon) || 1;
    };
    const bearing = (a, b) => {
      const toRad = (d) => (d * Math.PI) / 180;
      const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
      const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
        Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
      return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    };

    // Speed falls off as the road tilts up, the way a rider's does — a
    // constant 28km/h up a 6% climb is the kind of detail cyclists notice.
    const segment = () => {
      const i = Math.min(track.length - 2, Math.max(0, Math.floor(cursor)));
      const from = track[i];
      const to = track[i + 1];
      const run = metres(from, to);
      const gradient = (to.ele - from.ele) / run;
      const speedKmh = Math.min(46, Math.max(8, ${cruiseKmh} - gradient * 340));
      return { from, to, run, speedMs: speedKmh / 3.6 };
    };

    // Real GPS altitude wanders by a metre or so, and the app's elevation-gain
    // filter (a 0.5m floor, see record.tsx) is tuned for that. A noise-free
    // feed would report zero gain on anything but a wall.
    let noiseSeed = 1;
    const altitudeNoise = () => {
      noiseSeed = (noiseSeed * 1103515245 + 12345) % 2147483648;
      return ((noiseSeed / 2147483648) * 2 - 1) * 0.55;
    };

    const fix = () => {
      const { from, to, speedMs } = segment();
      return {
        coords: {
          latitude: from.lat,
          longitude: from.lon,
          altitude: from.ele + altitudeNoise(),
          accuracy: 4,
          altitudeAccuracy: 3,
          heading: bearing(from, to),
          speed: speedMs,
        },
        timestamp: Date.now(),
      };
    };

    const watches = new Map();
    let nextId = 1;
    Object.defineProperties(navigator.geolocation, {
      getCurrentPosition: { value: (ok) => setTimeout(() => ok(fix()), 60), configurable: true },
      watchPosition: {
        value: (ok) => {
          const id = nextId++;
          setTimeout(() => ok(fix()), 60);
          watches.set(
            id,
            setInterval(() => {
              const { run, speedMs } = segment();
              cursor += speedMs / run;
              ok(fix());
            }, 1000),
          );
          return id;
        },
        configurable: true,
      },
      clearWatch: {
        value: (id) => {
          clearInterval(watches.get(id));
          watches.delete(id);
        },
        configurable: true,
      },
    });
  })();`;
}

/** Seeds the signed-in session and UI preferences before any app code runs. */
function bootScript({ theme, profile, extra = {} }) {
  const projectRef = new URL(SUPABASE_URL).hostname.split(".")[0];
  const storage = {
    [`sb-${projectRef}-auth-token`]: JSON.stringify(session(profile)),
    "hodora-theme": theme,
    ...extra,
  };
  return `(() => {
    const entries = ${JSON.stringify(storage)};
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    // Runs before the document exists on the first navigation; the app's own
    // inline theme script applies the class from localStorage either way.
    document.documentElement?.classList.toggle("dark", ${theme === "dark"});
  })();`;
}

/** Writes rides straight into the app's offline store, so "saved offline" states are real. */
async function seedOfflineRides(page, rides) {
  await page.evaluate(async (payload) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("hodora-offline", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("rides"))
          db.createObjectStore("rides", { keyPath: "id" });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("rides", "readwrite");
        const store = transaction.objectStore("rides");
        for (const ride of payload) store.put(ride);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
      request.onerror = () => reject(request.error);
    });
  }, rides);
}

/** Waits for MapLibre to finish drawing — screenshots of half-loaded tiles are worse than useless. */
async function waitForMap(page, { timeout = 25000 } = {}) {
  await page.waitForSelector("canvas.maplibregl-canvas", { timeout });
  await page
    .waitForFunction(
      () => {
        const canvas = document.querySelector("canvas.maplibregl-canvas");
        return canvas && canvas.width > 0;
      },
      { timeout },
    )
    .catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(2500);
}

const stillness = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
`;

async function run() {
  const world = buildWorld();
  const rides = buildDemoRides(world);
  const profile = demoProfile;

  const devServer = await ensureDevServer();
  await mkdir(OUT_DIR, { recursive: true });

  // CHROMIUM_PATH lets a sandbox with a pre-installed browser skip
  // `playwright install`; HTTPS_PROXY sends the browser out the same way the
  // rest of the environment goes.
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    proxy: proxy ? { server: proxy, bypass: "127.0.0.1,localhost" } : undefined,
    args: ["--force-color-profile=srgb", "--font-render-hinting=none"],
  });

  // What matters is whether the *browser* can reach a service, which isn't
  // always what this process can reach — a sandbox can let one out and not
  // the other. Node checks the status code, the browser checks it can get
  // there at all; a service needs both.
  const usable = async (url) =>
    (await reachable(url, 8000)) && (await browserReachable(browser, url));

  const wantsStub = args["stub-tiles"] === true;
  const wantsReal = args["real-tiles"] === true;
  const tilesLive = wantsStub ? false : wantsReal || (await usable(`https://${TILE_HOST}/planet`));
  log(tilesLive ? "using live basemap tiles" : "using the generated stand-in basemap");

  const basemap = tilesLive
    ? null
    : {
        tileSource: createTileSource(world),
        glyphSource: await createGlyphSource({ log }),
        tileHost: TILE_HOST,
      };

  // The app pulls its typeface from Google Fonts; without it every shot comes
  // out in a system fallback, so serve the same families locally instead.
  const fontsLive = await usable("https://fonts.googleapis.com/css2?family=Space+Grotesk");
  const fontCss = fontsLive ? null : await createFontStylesheet({ log });
  if (!fontsLive)
    log(fontCss ? "serving the web fonts locally" : "web fonts unavailable — system fallback");

  const shots = buildShots(rides);
  const only = typeof args.only === "string" ? args.only.split(",") : null;
  const selected = only ? shots.filter((shot) => only.includes(shot.name)) : shots;

  let captured = 0;
  for (const shot of selected) {
    const device = DEVICE_PROFILES[shot.device];
    const context = await browser.newContext({
      ...device,
      colorScheme: shot.theme === "dark" ? "dark" : "light",
      locale: "en-GB",
      timezoneId: "Europe/London",
      permissions: ["geolocation"],
      geolocation: shot.geolocation ?? startOf(rides[0]),
      reducedMotion: "reduce",
    });

    await installStubs(context, {
      world,
      rides,
      profile,
      supabaseUrl: SUPABASE_URL,
      basemap,
      fontCss,
    });
    await context.addInitScript({
      content: bootScript({ theme: shot.theme ?? "light", profile, extra: shot.storage }),
    });
    if (shot.rider) await context.addInitScript({ content: riderScript(shot.rider) });

    const page = await context.newPage();
    page.on("pageerror", (error) => log(`  page error during ${shot.name}: ${error.message}`));
    if (process.env.DEBUG_STUBS) {
      page.on("request", (request) => {
        if (!request.url().startsWith(BASE_URL))
          log(`  -> ${request.method()} ${request.url().slice(0, 120)}`);
      });
      page.on("requestfailed", (request) =>
        log(`  xx ${request.url().slice(0, 120)} ${request.failure()?.errorText}`),
      );
    }
    await page.addStyleTag({ content: stillness }).catch(() => {});

    try {
      await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await seedOfflineRides(page, shot.offlineRides ?? []);
      if (shot.reload !== false) await page.reload({ waitUntil: "domcontentloaded" });
      await page.addStyleTag({ content: stillness }).catch(() => {});
      if (shot.prepare) await shot.prepare(page);
      if (shot.map !== false) await waitForMap(page);
      else {
        await page.waitForLoadState("networkidle").catch(() => {});
        await sleep(1200);
      }
      if (shot.dwellSeconds) await sleep(shot.dwellSeconds * 1000);
      if (shot.scrollTo) await scrollTo(page, shot.scrollTo);
      if (shot.after) await shot.after(page);

      // Park the pointer in the corner: a chart tooltip left open by an
      // earlier click is the kind of thing that only shows up in the PNG.
      await page.mouse.move(2, 2);
      await sleep(400);

      const file = path.join(OUT_DIR, `${shot.name}.png`);
      await page.screenshot({ path: file, fullPage: Boolean(shot.fullPage || args.full) });
      captured++;
      log(`captured ${path.relative(process.cwd(), file)}`);
    } catch (error) {
      log(`FAILED ${shot.name}: ${error.message}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  if (devServer) devServer.kill();
  log(
    `${captured}/${selected.length} screenshots written to ${path.relative(process.cwd(), OUT_DIR)}`,
  );
  if (captured < selected.length) process.exitCode = 1;
}

/**
 * Scrolls so the interesting part of a long page is what lands in frame —
 * a selector to bring into view, or a pixel offset.
 */
async function scrollTo(page, target) {
  if (typeof target === "number") {
    await page.evaluate((y) => window.scrollTo(0, y), target);
  } else if (typeof target === "function") {
    await target(page).catch(() => {});
  } else {
    await page
      .locator(target)
      .first()
      .evaluate((element) =>
        window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 100),
      )
      .catch(() => {});
  }
  await sleep(900);
}

const startOf = (ride) => ({ latitude: ride.points[0].lat, longitude: ride.points[0].lon });

/** Every point on a ride is more track than the rider simulator needs; thin it out. */
const thin = (ride) => ride.points.map(({ lat, lon, ele }) => ({ lat, lon, ele }));

const indexAtDistance = (ride, metres) => {
  const target = Math.max(0, Math.min(ride.distance_m - 50, metres));
  let index = ride.points.findIndex((point) => point.d >= target);
  return index < 1 ? 1 : index;
};

/**
 * Starts the rider at the beginning of the route and lets them ride for
 * `dwellSeconds` before the shot is taken.
 *
 * Riding from the start is what makes the numbers on screen agree: the app
 * measures progress along the route and elapsed time from when navigation
 * began, so dropping a rider in mid-route would show a minute of riding
 * against 16km covered. The demo loops are rotated to begin a few hundred
 * metres before a junction (see `startBeforeJunction` in `rides.mjs`), so a
 * minute in there is also a turn coming up.
 */
function ridingFromStart(ride, { dwellSeconds = 130 } = {}) {
  return {
    rider: { track: thin(ride), startIndex: 0 },
    geolocation: { latitude: ride.points[0].lat, longitude: ride.points[0].lon },
    dwellSeconds,
  };
}

function buildShots(rides) {
  const [loop, gravel, , chaingang, sportive, planned, evening] = rides;

  return [
    {
      name: "01-my-routes",
      device: "phone",
      path: "/rides",
      map: false,
      offlineRides: [loop, gravel],
      scrollTo: 430,
    },
    {
      name: "02-route-detail",
      device: "phone",
      path: `/rides/${loop.id}`,
      offlineRides: [loop],
      scrollTo: ".maplibregl-map",
    },
    {
      name: "03-navigation",
      device: "phone",
      path: `/rides/${loop.id}/nav`,
      ...ridingFromStart(loop),
    },
    {
      name: "04-cue-sheet",
      device: "phone",
      path: `/rides/${loop.id}`,
      map: false,
      prepare: async (page) => {
        await page
          .getByRole("button", { name: /view \d+ steps/i })
          .click()
          .catch(() => {});
        await sleep(700);
      },
    },
    {
      name: "05-plan-route",
      device: "phone",
      path: `/plan?edit=${planned.id}`,
      prepare: (page) => framePlannedRoute(page, { hidePanel: true }),
    },
    {
      name: "06-record",
      device: "phone",
      path: "/record",
      ...ridingUphill(chaingang),
      prepare: async (page) => {
        await page
          .getByRole("button", { name: /start/i })
          .first()
          .click()
          .catch(() => {});
      },
      dwellSeconds: 240,
    },
    {
      name: "07-wind-forecast",
      device: "phone",
      path: "/wind",
      map: false,
    },
    {
      name: "08-navigation-dark",
      device: "phone",
      theme: "dark",
      path: `/rides/${evening.id}/nav`,
      // Slower going than the daytime shots (it starts on a climb), so give
      // the rider longer to reach the junction.
      ...ridingFromStart(evening, { dwellSeconds: 240 }),
    },
    {
      // Downloads the route's map tiles for real, through the stubbed tile
      // host, and shows the card in its saved state.
      name: "09-offline",
      device: "phone",
      path: `/rides/${sportive.id}`,
      prepare: async (page) => {
        const save = page.getByRole("button", { name: /save for offline/i });
        await save.scrollIntoViewIfNeeded().catch(() => {});
        await save.click().catch(() => {});
        await page
          .getByRole("button", { name: /remove download/i })
          .waitFor({ timeout: 90000 })
          .catch(() => {});
      },
      // Frame the bottom of the map together with the offline card, so the
      // shot says "this route, saved" rather than showing a lone card.
      scrollTo: (page) =>
        page
          .getByRole("heading", { name: /offline/i })
          .first()
          .evaluate((element) =>
            window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 430),
          ),
    },
    {
      name: "10-desktop-routes",
      device: "desktop",
      path: "/rides",
      map: false,
      offlineRides: [loop, gravel],
    },
    {
      name: "11-desktop-route-detail",
      device: "desktop",
      path: `/rides/${sportive.id}`,
      offlineRides: [loop],
      scrollTo: 265,
    },
    {
      name: "12-desktop-navigation",
      device: "desktop",
      path: `/rides/${gravel.id}/nav`,
      ...ridingFromStart(gravel),
    },
    {
      name: "13-desktop-plan",
      device: "desktop",
      path: `/plan?edit=${planned.id}`,
      prepare: (page) => framePlannedRoute(page),
    },
    {
      name: "14-landing",
      device: "desktop",
      path: "/",
      map: false,
    },
  ];
}

/**
 * Starts a recording on a gentle climb of about `gradient`, so the ride on
 * screen has some elevation gain behind it without the rider crawling.
 */
function ridingUphill(ride, { overM = 1500, gradient = 0.015 } = {}) {
  let startIndex = 1;
  let best = Infinity;
  for (let i = 0; i < ride.points.length; i++) {
    const end = ride.points.findIndex((point) => point.d >= ride.points[i].d + overM);
    if (end < 0) break;
    const rise = (ride.points[end].ele - ride.points[i].ele) / overM;
    const off = Math.abs(rise - gradient);
    if (off < best) {
      best = off;
      startIndex = i;
    }
  }
  return {
    rider: { track: thin(ride), startIndex },
    geolocation: { latitude: ride.points[startIndex].lat, longitude: ride.points[startIndex].lon },
  };
}

/**
 * Frames a saved planned route in the planner: the app re-routes it through
 * the router as soon as it loads, so this is the planner doing its real work
 * rather than a script clicking blindly at a map it can't see.
 */
async function framePlannedRoute(page, { hidePanel = false } = {}) {
  await page.waitForSelector("canvas.maplibregl-canvas", { timeout: 25000 });
  await sleep(4000);
  if (hidePanel) {
    await page
      .getByRole("button", { name: /hide route details/i })
      .click()
      .catch(() => {});
    await sleep(600);
  }
  await page
    .getByRole("button", { name: /fit the route to the view/i })
    .click()
    .catch(() => {});
  await sleep(2500);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
