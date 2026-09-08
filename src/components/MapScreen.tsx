import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * Shared chrome for the full-bleed map screens — /plan, /explore, /record and
 * the control rail on live navigation.
 *
 * The shape is the same on all of them, and it's the one the navigation
 * screen already established: the map runs edge to edge underneath
 * everything, and the page's own controls float on top of it as glass panels
 * — a search box and an icon rail across the top, a detail column anchored to
 * the bottom-left corner. Nothing here scrolls the page. The screen is locked
 * to the viewport (`MapScreen`) and the detail column scrolls inside itself
 * (`MapPanel`), so dragging the map never fights the page for the gesture.
 */

/**
 * Page root: locks the screen to the viewport so the map can fill what's left
 * under the header.
 *
 * `100dvh` rather than the `screen-fill` utility because these pages render an
 * `AppHeader`, and styles.css drops the body's top safe-area padding whenever
 * one is present (the header paints that strip itself) — so the viewport
 * height is the whole box here, not the box minus the inset. `dvh` so it
 * tracks mobile browser chrome collapsing and expanding.
 *
 * `data-map-screen` is what the body rule in styles.css keys off to drop the
 * mobile tab bar's bottom clearance: the map is *meant* to run under the bar,
 * and `MapOverlay` re-applies that clearance to its own contents so nothing
 * tappable ends up behind it.
 */
export function MapScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      data-map-screen
      className={cn("flex h-[100dvh] flex-col overflow-hidden bg-background", className)}
    >
      {children}
    </div>
  );
}

/**
 * The area below the header that the map fills. Takes the map (absolutely
 * positioned) and a `MapOverlay` as its children.
 */
export function MapStage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("relative min-h-0 flex-1", className)}>{children}</div>;
}

/**
 * The floating chrome layer, laid out top-to-bottom: a toolbar row at the top,
 * then a growing spacer that keeps the map visible, with the detail panel
 * sitting on its bottom edge.
 *
 * `pointer-events-none` so the map still pans and zooms through the gaps
 * between panels; every panel turns pointer events back on for itself. The
 * bottom padding clears the phone tab bar plus the Android gesture bar / iOS
 * home indicator, which the body no longer reserves for a map screen.
 */
export function MapOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-2 p-3 pb-[calc(0.75rem+3.5rem+var(--safe-area-inset-bottom))] sm:gap-3 sm:p-4 sm:pb-[calc(1rem+var(--safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

/**
 * Top row of the overlay: a search box on the left and the icon rail on the
 * right. They stack on a phone, where a search box wide enough to type a place
 * name into leaves no room for five buttons beside it.
 */
export function MapToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("flex shrink-0 flex-col gap-2 sm:flex-row sm:items-start sm:gap-3", className)}
    >
      {children}
    </div>
  );
}

/**
 * The icon rail. A wrapping row rather than a column on purpose: stacked
 * buttons are taller than the space left on a short phone and end up drawn
 * over the panel, where a row wraps into the empty map instead.
 */
export function MapRail({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn("pointer-events-auto flex flex-wrap justify-end gap-2 sm:ml-auto", className)}
    >
      {children}
    </div>
  );
}

/**
 * A rail button: icon-only and circular, so a handful of them tuck into the
 * corner without forming the wrapping pill row that labelled buttons would.
 * `active` gives the same filled treatment the labelled `default` variant has.
 */
export function MapRailButton({
  children,
  label,
  onClick,
  active = false,
  pressed,
  disabled = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant={active ? "default" : "secondary"}
      className={cn("size-11 rounded-full [&_svg]:size-5", !active && "glass")}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * The detail column, anchored to the bottom-left of the map: a bottom sheet on
 * a phone, a sidebar on anything wider. It scrolls within itself rather than
 * growing the screen — the page is height-locked and can't scroll to reveal
 * anything that overflows — and `max-h-full` keeps at least the toolbar row of
 * map visible above it whatever ends up inside.
 */
export function MapPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-end">
      <div
        className={cn(
          "pointer-events-auto flex max-h-full w-full flex-col gap-2 overflow-y-auto overscroll-contain sm:w-[23rem] sm:gap-3",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** One glass card inside a `MapPanel`, or a standalone floating strip. */
export function MapCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("glass pointer-events-auto shrink-0 p-4", className)}>{children}</div>;
}
