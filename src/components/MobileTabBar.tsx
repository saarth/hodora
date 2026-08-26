import { Link } from "@tanstack/react-router";
import { Circle, Compass, Home, Route, Wind } from "lucide-react";

/**
 * Phone-sized primary navigation. The header's Explore/Plan/Wind/Record links
 * are `hidden sm:inline-flex`, which leaves a phone — and therefore the native
 * app, which has no browser chrome to fall back on — with no way to reach
 * those sections at all. This is that navigation, in the same design language:
 * a fixed bar that clears the Android gesture bar / iOS home indicator.
 *
 * `data-mobile-tabbar` is what the body clearance rule in styles.css keys off,
 * so pages reserve the right amount of space without each one opting in.
 */
const TABS = [
  // `exact` only on Home: without it "/" counts as active on every route.
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/explore", label: "Explore", icon: Compass, exact: false },
  { to: "/plan", label: "Plan", icon: Route, exact: false },
  { to: "/wind", label: "Wind", icon: Wind, exact: false },
  { to: "/record", label: "Record", icon: Circle, exact: false },
] as const;

export function MobileTabBar() {
  return (
    <nav
      data-mobile-tabbar
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl pb-[var(--safe-area-inset-bottom)] sm:hidden"
    >
      <ul className="mx-auto flex h-14 max-w-md items-stretch justify-around px-1">
        {TABS.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact }}
              className="flex h-full flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors data-[status=active]:text-primary"
            >
              <Icon className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
