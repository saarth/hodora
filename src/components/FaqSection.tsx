import type { FaqItem } from "@/lib/seo";

/**
 * The visible half of a page's FAQ. The other half is `faqJsonLd(items)` in
 * that route's `head()` — both read the same array, because a `FAQPage`
 * whose answers don't appear on the page is exactly what rich-result
 * validation rejects.
 *
 * Plain `<h3>`/`<p>` rather than an accordion on purpose: text hidden behind
 * a click is still indexed, but an LLM crawler that doesn't run JavaScript
 * only sees what's in the server-rendered HTML.
 */
export function FaqSection({
  heading,
  items,
  id = "faq",
}: {
  heading: string;
  items: FaqItem[];
  id?: string;
}) {
  return (
    <section id={id} className="mt-20" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="text-2xl font-bold sm:text-3xl">
        {heading}
      </h2>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.question} className="surface p-6">
            <h3 className="text-base font-bold">{item.question}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
