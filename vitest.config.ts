import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Kept separate from vite.config.ts (which builds the app) so the test
// runner's config can't drift into affecting the production build, and vice
// versa. jsdom is required for parseGpx()'s `new DOMParser()` call.
export default defineConfig({
  resolve: {
    alias: { "@": resolve(process.cwd(), "src") },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
