import { Link } from "@tanstack/react-router";

/**
 * Server-rendered stand-in for a route declared `ssr: false`.
 *
 * `/plan`, `/explore` and `/wind` skip SSR because MapLibre and the
 * geolocation/IndexedDB code they lean on only exist in a browser. For the
 * first `ssr: false` route in a match, TanStack Start renders that route's
 * `pendingComponent` on the server instead — so without one, the HTML a
 * crawler fetches is the empty app shell: no `<h1>`, and a text-to-HTML ratio
 * near zero (both flagged by an SEO audit).
 *
 * Pass the same heading and intro the hydrated page shows, plus a few lines on
 * what the tool does. Like the marketing pages, every line must describe real
 * behaviour — check the route's code before changing one. It's replaced as
 * soon as the client component mounts.
 */
export function ClientOnlyFallback({
  title,
  intro,
  points,
}: {
  title: string;
  intro: string;
  points: string[];
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col justify-center px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{intro}</p>
      <ul className="mt-6 list-disc space-y-2 pl-5 text-sm leading-relaxed">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">
        Hodora is a free, open-source bike navigation app. New here? Read{" "}
        <Link to="/how-to-use" className="underline underline-offset-2">
          how to use Hodora
        </Link>{" "}
        or the{" "}
        <Link to="/faq" className="underline underline-offset-2">
          FAQ
        </Link>
        .
      </p>
    </main>
  );
}
