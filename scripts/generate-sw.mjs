// Generates the production service worker.
//
// Why this exists instead of just letting vite-plugin-pwa do it: this is a
// TanStack Start + Nitro project (cloudflare-module preset). The client
// bundle Nitro actually serves ends up in `.output/public`, which only
// exists once Nitro has finished assembling it — after `vite build`
// completes. vite-plugin-pwa's `generateSW` strategy hooks into a `dist/`
// build pass that isn't the one Nitro serves from, so it was writing a
// service worker with an empty precache manifest to a directory nobody
// deploys (`dist/client`), and the real production output (`.output/public`)
// never got a `sw.js` at all — `src/lib/pwa.ts`'s `registerServiceWorker()`
// would 404 against `/sw.js` in production, silently disabling offline
// support (offline maps, cached rides, the works).
//
// Run this after `vite build` (see the "build" script in package.json), once
// `.output/public` is fully populated, and write the service worker there
// directly with workbox-build.
import { generateSW } from "workbox-build";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { workboxConfig } from "../pwa-config.mjs";

const rootDir = dirname(fileURLToPath(import.meta.url)) + "/..";
const globDirectory = resolve(rootDir, ".output/public");
const swDest = resolve(globDirectory, "sw.js");

if (!existsSync(globDirectory)) {
  console.error(
    `[generate-sw] ${globDirectory} doesn't exist yet — run "vite build" first.`,
  );
  process.exit(1);
}

const { count, size, warnings } = await generateSW({
  ...workboxConfig,
  globDirectory,
  swDest,
  // Keep the manifest scoped to same-origin files workbox-build can glob
  // directly; cross-origin runtime caching (basemap tiles, fonts) is handled
  // by workboxConfig.runtimeCaching, same as before.
});

for (const warning of warnings) console.warn(`[generate-sw] ${warning}`);

console.log(
  `[generate-sw] wrote ${swDest} — precaching ${count} files (${(size / 1024).toFixed(1)} KiB)`,
);
