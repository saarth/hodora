/**
 * Renders schema.org JSON-LD into the document.
 *
 * Lives in a component rather than the route's `head.scripts` so it ships with
 * the server-rendered HTML — Google reads structured data anywhere in the page,
 * so the position in <body> is fine.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // Serialised here from static objects — no user input reaches this. The
      // "<" escape stops a string in the data from closing the script tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\u003c") }}
    />
  );
}
