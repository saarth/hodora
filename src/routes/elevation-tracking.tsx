import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Folded into /how-to-use.
 *
 * This was a standalone topic page ("Elevation tracking"). Eight of them each
 * restated the app's premise before reaching their own point, and between
 * them split the internal linking eight ways; they are now sections of one
 * guide.
 *
 * A 301 rather than a deletion: these URLs were published and indexed, and a
 * permanent redirect passes their accrued ranking to the page that replaced
 * them instead of handing crawlers eight 404s. `beforeLoad` runs on the
 * server during SSR, so a crawler gets a real 301 — not a client-side
 * bounce it would have to execute JavaScript to notice.
 */
export const Route = createFileRoute("/elevation-tracking")({
  beforeLoad: () => {
    throw redirect({ to: "/how-to-use", statusCode: 301 });
  },
});
