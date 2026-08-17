import { cn } from "@/lib/utils";

/**
 * The brand mark: one continuous cursive stroke — entry curl, raked
 * ascender, a closed hood loop (fork crown), handlebar-arch hump, drop-hook
 * exit (fork blade to dropout) — reading as both a lowercase "h" and a
 * front bike fork. A small rust "clamp bolt" accent sits at the hump peak.
 * Stroke follows currentColor so it adapts to any surface; size follows the
 * rendered width (viewBox is 220x320, ~0.6875 aspect).
 */
export function HodoraMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 320"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M38,266 C22,258 24,236 40,222 C56,208 60,170 58,132 C57,110 62,86 80,74 C94,65 106,70 102,86 C99,98 90,104 84,116 C80,126 80,138 86,146 C96,132 112,128 128,134 C142,140 148,158 148,180 C148,205 150,228 150,258 C150,267 156,274 166,270"
        stroke="currentColor"
        strokeWidth={16}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="106" cy="138" r="6" className="fill-rust" />
    </svg>
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
      <HodoraMark className={cn("h-7 w-auto text-primary", markClassName)} />
      <span className={cn("font-display text-lg font-bold tracking-tight", textClassName)}>
        hodora
      </span>
    </span>
  );
}
