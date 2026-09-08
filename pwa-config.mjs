// Shared between vite.config.ts (dev server + manifest.webmanifest generation)
// and scripts/generate-sw.mjs (the postbuild step that emits the real,
// production service worker). Keeping one source of truth avoids the two
// drifting apart.

export const pwaManifest = {
  name: "Hodora — GPX bike navigation",
  short_name: "Hodora",
  description:
    "Free GPX turn-by-turn navigation for club rides and cycling events. No dedicated bike computer, no subscription.",
  theme_color: "#1F3A2E",
  background_color: "#152A21",
  display: "standalone",
  start_url: "/rides",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export const workboxConfig = {
  globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
  navigateFallback: "/",
  navigateFallbackDenylist: [
    /^\/~oauth/,
    /^\/api\//,
    /^\/robots\.txt$/,
    /^\/sitemap\.xml$/,
    // Plain-text crawler routes: the SPA shell is not a valid answer for them.
    /^\/llms\.txt$/,
  ],
  cleanupOutdatedCaches: true,
  runtimeCaching: [
    {
      // HTML navigations: always try the network first.
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: {
        cacheName: "html-navigations",
        networkTimeoutSeconds: 5,
      },
    },
    {
      // Basemap vector tiles, glyphs (fonts) and the TileJSON the cycling
      // style (src/lib/cycling-style.ts) requests — from OpenFreeMap by
      // default, or MapTiler when VITE_MAPTILER_KEY is set. Both hosts are
      // listed unconditionally: this file is build-time config and can't
      // read the provider choice out of src/lib/basemap.ts.
      //
      // The cache name must stay in sync with `TILE_CACHE` in
      // src/lib/offline-tiles.ts — the explicit "save for offline" download
      // writes into this same bucket, and the service worker is what reads
      // it back. (Vector pbfs are larger than the raster PNGs this
      // replaced, but one tile now covers both light and dark themes and
      // every zoom above 14, so a route needs far fewer of them.)
      //
      // CacheFirst on the TileJSON matters as well as on the tiles:
      // OpenFreeMap versions each planet build behind a dated path, so
      // pinning the TileJSON keeps the live map asking for the exact tile
      // URLs the offline download already stored. When it does expire and
      // a newer planet is published, `isRouteMapSaved` sees the mismatch
      // and reports the route as needing a re-download.
      urlPattern: /^https:\/\/(tiles\.openfreemap\.org|api\.maptiler\.com)\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "map-tiles",
        expiration: { maxEntries: 20000, maxAgeSeconds: 60 * 60 * 24 * 120 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts",
        expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
};
