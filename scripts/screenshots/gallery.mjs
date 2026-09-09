/**
 * Composes the captured screenshots into gallery images for a launch listing
 * (Product Hunt wants 1270x760; AlternativeTo takes the raw screenshots).
 *
 * These are marketing composites: a real screenshot, a device frame, and a
 * line of copy on the app's own palette. Nothing in the screenshot itself is
 * altered.
 *
 *   node scripts/screenshots/gallery.mjs [--in=screenshots] [--out=screenshots/gallery]
 */

import { chromium } from "playwright";
import { createFontStylesheet } from "./fonts.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);

const IN_DIR = path.resolve(args.in ?? "screenshots");
const OUT_DIR = path.resolve(args.out ?? path.join(IN_DIR, "gallery"));
const WIDTH = 1270;
const HEIGHT = 760;

const PALETTE = {
  parchment: "#F2ECDC",
  ink: "#1A1815",
  green: "#1F3A2E",
  rust: "#B5622F",
  brass: "#C9A15D",
};

/** The launch gallery, in the order a listing should show it. */
const CARDS = [
  {
    name: "01-hero",
    shot: "03-navigation.png",
    kind: "phone",
    eyebrow: "Free · open source · no subscription",
    headline: "Turn-by-turn navigation for the ride you already have",
    body: "Import the club run's GPX and follow it with live turn prompts, grade, and voice announcements — on the phone in your pocket, with no bike computer to buy and no subscription to pay for.",
    tone: "green",
  },
  {
    name: "02-import",
    shot: "01-my-routes.png",
    kind: "phone",
    eyebrow: "Bring your own routes",
    headline: "Any GPX, from anywhere",
    body: "Komoot, Strava, Ride with GPS, Garmin, or whatever the event organiser emailed you. Search and filter your library by distance, difficulty, surface or offline status.",
    tone: "parchment",
  },
  {
    name: "03-plan",
    shot: "13-desktop-plan.png",
    kind: "desktop",
    eyebrow: "Plan",
    headline: "Draw a route over real roads and paths",
    body: "Tap the map and Hodora routes between your points with OpenStreetMap cycling data — with elevation, a weather-at-departure forecast, and full editing after you save.",
    tone: "parchment",
  },
  {
    name: "04-weather",
    shot: "07-wind-forecast.png",
    kind: "phone",
    eyebrow: "Wind & weather",
    headline: "Know the headwind before you turn into it",
    body: "Live conditions during navigation, a headwind/tailwind call-out relative to your direction of travel, and a heads-up before the rain arrives.",
    tone: "green",
  },
  {
    name: "05-offline",
    shot: "09-offline.png",
    kind: "phone",
    eyebrow: "Offline",
    headline: "A patchy signal doesn't lose your route",
    body: "Save the route and its map tiles to your device before you leave. Navigation, cue sheet and map all keep working with no connection at all.",
    tone: "parchment",
  },
  {
    name: "06-everywhere",
    shot: "11-desktop-route-detail.png",
    kind: "desktop",
    eyebrow: "Web · PWA · Android",
    headline: "Runs in the browser, installs like an app",
    body: "No app store required. Add it to your home screen on Android or iOS, or self-host the whole thing — it's MIT licensed and the source is on GitHub.",
    tone: "green",
  },
];

async function dataUri(file) {
  const buffer = await readFile(file);
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function cardHtml(card, image, fontCss) {
  const dark = card.tone === "green";
  const background = dark
    ? `radial-gradient(120% 120% at 12% 0%, #2b5040 0%, ${PALETTE.green} 55%, #16281f 100%)`
    : `radial-gradient(120% 120% at 85% 10%, #fbf7ee 0%, ${PALETTE.parchment} 60%, #e7dcc4 100%)`;
  const text = dark ? PALETTE.parchment : PALETTE.ink;
  const muted = dark ? "rgba(242,236,220,0.72)" : "rgba(26,24,21,0.68)";
  const eyebrow = dark ? PALETTE.brass : PALETTE.rust;

  const device =
    card.kind === "phone"
      ? `<div class="phone"><img src="${image}" alt=""></div>`
      : `<div class="laptop"><img src="${image}" alt=""></div>`;

  return `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  ${fontCss ?? ""}
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden;
    background: ${background}; color: ${text};
    font-family: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
    display: grid; grid-template-columns: ${card.kind === "phone" ? "1fr 420px" : "1fr"};
    ${card.kind === "phone" ? "align-items: center;" : "grid-template-rows: auto 1fr;"}
    gap: ${card.kind === "phone" ? "36px" : "22px"};
    padding: ${card.kind === "phone" ? "64px 0 64px 72px" : "56px 72px 0"};
  }
  .copy { max-width: ${card.kind === "phone" ? "100%" : "820px"}; }
  .eyebrow {
    font-size: 15px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
    color: ${eyebrow}; margin-bottom: 18px;
  }
  h1 { font-size: ${card.kind === "phone" ? "50px" : "46px"}; line-height: 1.06; font-weight: 700; letter-spacing: -0.02em; }
  p { margin-top: 20px; font-size: ${card.kind === "phone" ? "20px" : "19px"}; line-height: 1.5; color: ${muted}; max-width: 30em; }
  .mark { margin-top: 34px; display: flex; align-items: center; gap: 12px; font-size: 19px; font-weight: 700; color: ${text}; opacity: 0.9; }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: ${PALETTE.rust}; }

  .phone {
    justify-self: center; width: 306px; padding: 11px; border-radius: 44px;
    background: linear-gradient(160deg, #3a3a38, #17171a);
    box-shadow: 0 40px 90px rgba(0,0,0,0.42), 0 0 0 1px rgba(255,255,255,0.06) inset;
  }
  .phone img { width: 100%; display: block; border-radius: 33px; }
  .laptop {
    justify-self: center; align-self: end; width: 940px; padding: 14px 14px 0; border-radius: 18px 18px 0 0;
    background: linear-gradient(160deg, #3a3a38, #17171a);
    box-shadow: 0 40px 90px rgba(0,0,0,0.42);
  }
  .laptop img { width: 100%; display: block; border-radius: 8px 8px 0 0; }
</style></head>
<body>
  <div class="copy">
    <div class="eyebrow">${card.eyebrow}</div>
    <h1>${card.headline}</h1>
    <p>${card.body}</p>
    <div class="mark"><span class="dot"></span>hodora.app</div>
  </div>
  ${device}
</body></html>`;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  // The page source is only an intermediate step; keep it out of the output.
  const workDir = path.join(
    process.cwd(),
    "node_modules",
    ".cache",
    "hodora-screenshots",
    "gallery",
  );
  await mkdir(workDir, { recursive: true });
  // Embed the typeface rather than trusting the network: a gallery image in
  // the wrong font is worse than one that took a second longer to build.
  const fontCss = await createFontStylesheet({ log: (message) => console.log(`  ${message}`) });
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    proxy: proxy ? { server: proxy, bypass: "127.0.0.1,localhost" } : undefined,
  });
  // 1.5x: comfortably above Product Hunt's 1270x760 without committing
  // several megabytes per image to the repository.
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1.5,
  });
  const page = await context.newPage();

  let made = 0;
  for (const card of CARDS) {
    const source = path.join(IN_DIR, card.shot);
    if (!existsSync(source)) {
      console.log(`  skipping ${card.name} — ${card.shot} not captured yet`);
      continue;
    }
    const file = path.join(workDir, `${card.name}.html`);
    await writeFile(file, cardHtml(card, await dataUri(source), fontCss));
    await page.goto(`file://${file}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, `${card.name}.png`) });
    made++;
    console.log(`  composed ${card.name}.png`);
  }

  await browser.close();
  console.log(`  ${made} gallery images in ${path.relative(process.cwd(), OUT_DIR)}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
