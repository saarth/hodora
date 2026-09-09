import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Bug, Code2, Heart, Megaphone, Star, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GithubIcon, GITHUB_URL, MarketingLayout } from "@/components/MarketingLayout";
import { absoluteUrl, breadcrumbJsonLd, canonicalLink } from "@/lib/seo";
import { hasAnySupportLink, SUPPORT_LINKS } from "@/lib/support";

const TITLE = "Support Hodora — Free, Open-Source Bike Navigation | Hodora";
const DESCRIPTION =
  "Hodora is free and open source with no ads and no subscription. Support it with a donation, or help just as much by starring the repo, reporting bugs, sharing it or contributing code and docs.";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: absoluteUrl("/support") },
      { "script:ld+json": breadcrumbJsonLd([{ name: "Support", path: "/support" }]) },
    ],
    links: canonicalLink("/support"),
  }),
  component: SupportPage,
});

/**
 * `recommended` drives the badge. GitHub Sponsors gets it because it is the
 * only option here that can recur, which is what actually pays a domain and
 * a server bill month to month rather than once.
 */
const DONATIONS = [
  {
    key: "githubSponsors" as const,
    icon: Heart,
    title: "GitHub Sponsors",
    body: "Monthly or one-off, through the account you already have. Recurring support is what keeps the domain and the server paid for without anyone having to think about it.",
    cta: "Sponsor on GitHub",
    recommended: true,
  },
  {
    key: "revolut" as const,
    icon: Wallet,
    title: "Revolut",
    body: "A direct payment link with the smallest cut taken out of it, so more of what you send actually reaches the project.",
    cta: "Donate with Revolut",
    recommended: false,
  },
];

const OTHER_WAYS = [
  {
    icon: Star,
    title: "Star it on GitHub",
    body: "The cheapest thing on this page and one of the most useful. Stars are how people find a project they have never heard of, and how it looks alive to someone deciding whether to trust it with their weekend ride.",
    href: GITHUB_URL,
    linkLabel: "Star the repository",
  },
  {
    icon: Bug,
    title: "Report bugs",
    body: "A bug nobody reports is a bug nobody fixes. Tell me what you did, what happened and which phone you were on — even a rough description beats silence, and route data that breaks the parser is the most valuable thing you can send.",
    href: `${GITHUB_URL}/issues/new`,
    linkLabel: "Open an issue",
  },
  {
    icon: Megaphone,
    title: "Share it",
    body: "Mention it to your club, drop it in the ride chat, or put the link under the GPX for the next event. Riders who have never considered navigating without a head unit are exactly the people this is for.",
  },
  {
    icon: Code2,
    title: "Contribute code",
    body: "Pull requests are welcome, from a one-line fix upwards. The stack is TypeScript, React and TanStack Start, the tests run with one command, and issues that are a reasonable first job are the ones to look at.",
    href: `${GITHUB_URL}/pulls`,
    linkLabel: "Browse pull requests",
  },
  {
    icon: BookOpen,
    title: "Improve the docs",
    body: "If something on the how-to page was wrong, out of date, or assumed knowledge you did not have, that is a real bug too. Writing the sentence that would have helped you is a genuine contribution.",
    href: `${GITHUB_URL}/tree/main/docs`,
    linkLabel: "See the docs",
  },
  {
    icon: Heart,
    title: "Just tell me it worked",
    body: "An issue saying a sportive went smoothly, or that the off-route alert saved a wrong turn, is worth more than it sounds when a project is maintained in someone's spare time.",
  },
];

function SupportPage() {
  const showDonations = hasAnySupportLink();
  const available = DONATIONS.filter((option) => SUPPORT_LINKS[option.key]);
  // A single live link in a three-column grid reads as two cards failing to
  // load, so the track count follows how many are actually configured.
  const donationGrid =
    available.length === 1
      ? "sm:max-w-md"
      : available.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-3";
  // Exactly one card carries the primary button, whichever cards are live:
  // the recommended one when it is configured, otherwise the first that is.
  // Without this the section can render with every option a muted outline
  // and no obvious place to click.
  const primaryKey = (available.find((option) => option.recommended) ?? available[0])?.key;

  return (
    <MarketingLayout>
      <article className="pt-12 sm:pt-16">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-rust">
          Free forever &middot; No ads &middot; No subscription
        </p>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] sm:text-5xl">
          Support <span className="font-serif font-normal italic text-rust">Hodora</span>.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Hodora is free and open source, and it stays that way — there is no paid tier waiting
          behind a future release. It does cost something to run, and it is maintained in spare
          time, so if it has been useful there are a few ways to help. Most of them cost nothing.
        </p>

        {showDonations && (
          <section className="mt-20" aria-labelledby="donate">
            <h2 id="donate" className="text-2xl font-bold sm:text-3xl">
              Chip in
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Every one of these is optional and none of them unlocks anything — the app is the same
              app either way.
            </p>
            <div className={`mt-8 grid gap-4 ${donationGrid}`}>
              {available.map((option) => {
                // The badge only means something next to alternatives; the
                // primary styling is independent of it, so a section with no
                // recommended option still has one obvious button.
                const badged = option.recommended && available.length > 1;
                const highlight = option.key === primaryKey;

                return (
                  <section
                    key={option.key}
                    className={`surface relative flex flex-col p-6 ${badged ? "border-rust" : ""}`}
                  >
                    {badged && (
                      <span className="absolute right-4 top-4 rounded-full bg-rust px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-background">
                        Recommended
                      </span>
                    )}
                    <option.icon className="size-5 text-primary" />
                    <h3 className="mt-4 text-base font-bold">{option.title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {option.body}
                    </p>
                    <Button
                      asChild
                      size="sm"
                      variant={highlight ? "default" : "outline"}
                      className={`mt-5 self-start ${highlight ? "glow-ring" : ""}`}
                    >
                      <a href={SUPPORT_LINKS[option.key]!} target="_blank" rel="noreferrer">
                        {option.cta}
                      </a>
                    </Button>
                  </section>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-20" aria-labelledby="other-ways">
          <h2 id="other-ways" className="text-2xl font-bold sm:text-3xl">
            Other ways to help
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {showDonations
              ? "Not in a position to donate? None of these cost anything, and some of them help more."
              : "Nothing here costs anything, and all of it helps."}
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {OTHER_WAYS.map((way) => (
              <section key={way.title} className="surface flex flex-col p-6">
                <way.icon className="size-5 text-primary" />
                <h3 className="mt-4 text-base font-bold">{way.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {way.body}
                </p>
                {way.href && (
                  <a
                    href={way.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-2"
                  >
                    {way.linkLabel}
                    <ArrowRight className="size-3.5" />
                  </a>
                )}
              </section>
            ))}
          </div>
        </section>

        <section className="surface mt-12 border-l-2 border-l-rust p-6">
          <h2 className="text-lg font-bold">Thank you</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Hodora started as a learn-by-doing project and it is still that. Every bug report, every
            star and every rider who takes it out on a club run makes it better for the next person
            who needs to follow a GPX and does not want to buy a bike computer to do it.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild variant="outline">
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GithubIcon className="size-4" />
                Hodora on GitHub
              </a>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/how-to-use">
                Read the guide
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </article>
    </MarketingLayout>
  );
}
