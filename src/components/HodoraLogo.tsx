import { cn } from "@/lib/utils";

/**
 * The brand mark: a cursive "h" flowing into a spoked bicycle wheel.
 * Shipped as two flattened, theme-matched SVGs (racing-green ink for light
 * surfaces, parchment ink for dark/green ones) rather than a single
 * currentColor stroke — the source illustration is a ~400-path duotone
 * traced from artwork, not a drawable single-weight line.
 */
export function HodoraMark({ className }: { className?: string }) {
  return (
    <>
      <img
        src="/brand-mark-light.svg"
        alt=""
        aria-hidden="true"
        className={cn(className, "dark:hidden")}
      />
      <img
        src="/brand-mark-dark.svg"
        alt=""
        aria-hidden="true"
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}

/** Mark + wordmark lockup, used for the primary header/nav logo. */
export function HodoraLogo({
  className,
  markClassName,
  textClassName,
}: {
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <HodoraMark className={cn("h-8 w-8", markClassName)} />
      <span className={cn("font-display text-lg font-bold tracking-tight", textClassName)}>
        hodora
      </span>
    </span>
  );
}
