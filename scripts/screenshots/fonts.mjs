/**
 * Local stand-in for the Google Fonts stylesheet the app loads.
 *
 * The screenshots should show the app's real typography. When
 * `fonts.googleapis.com` can't be reached, Chromium silently falls back to a
 * system face and every shot comes out in the wrong font — subtle enough to
 * miss, obvious enough to look wrong next to the site. This fetches the same
 * families from the upstream font repositories and serves them as an
 * equivalent stylesheet.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), "node_modules", ".cache", "hodora-screenshots");

/** The three families `src/routes/__root.tsx` asks Google Fonts for. */
const FAMILIES = [
  {
    family: "Space Grotesk",
    style: "normal",
    weight: "300 700",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf",
  },
  {
    family: "Fraunces",
    style: "normal",
    weight: "100 900",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
  },
  {
    family: "Fraunces",
    style: "italic",
    weight: "100 900",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/fraunces/Fraunces-Italic%5BSOFT%2CWONK%2Copsz%2Cwght%5D.ttf",
  },
  {
    family: "Roboto Mono",
    style: "normal",
    weight: "100 700",
    url: "https://raw.githubusercontent.com/google/fonts/main/ofl/robotomono/RobotoMono%5Bwght%5D.ttf",
  },
];

async function cached(name, produce) {
  await mkdir(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, name);
  if (existsSync(file)) return readFile(file);
  const data = await produce();
  await writeFile(file, data);
  return data;
}

/**
 * Builds the replacement stylesheet, or returns `null` if the fonts can't be
 * fetched — in which case the run goes ahead with whatever Chromium picks.
 */
export async function createFontStylesheet({ log = () => {} } = {}) {
  const faces = [];
  for (const face of FAMILIES) {
    try {
      const name = `${face.family.replace(/\s+/g, "-")}-${face.style}.ttf`;
      const ttf = await cached(name, async () => {
        const response = await fetch(face.url);
        if (!response.ok) throw new Error(`${response.status} fetching ${face.url}`);
        return Buffer.from(await response.arrayBuffer());
      });
      faces.push(
        `@font-face{font-family:'${face.family}';font-style:${face.style};font-weight:${face.weight};font-display:block;` +
          `src:url(data:font/ttf;base64,${ttf.toString("base64")}) format('truetype');}`,
      );
    } catch (error) {
      log(`could not fetch ${face.family} ${face.style} (${error.message}) — using fallback fonts`);
      return null;
    }
  }
  return faces.join("\n");
}
