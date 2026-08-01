// Shared between vite.config.ts (dev server + manifest.webmanifest generation)
// and scripts/generate-sw.mjs (the postbuild step that emits the real,
// production service worker). Keeping one source of truth avoids the two
// drifting apart.

export const pwaManifest = {
  name: "Hodora — GPX bike navigation",
  short_name: "Hodora",
  description:
    "Import GPX routes and ride them with live turn-by-turn navigation, offline maps and elevation profiles.",
  theme_color: "#0b1220",
  background_color: "#0b1220",
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
  navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//],
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
      // Basemap raster tiles — also filled by the explicit route download.
      urlPattern: /^https:\/\/basemaps\.cartocdn\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "map-tiles",
        expiration: { maxEntries: 12000, maxAgeSeconds: 60 * 60 * 24 * 120 },
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
