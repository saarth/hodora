import { cn } from "@/lib/utils";

/**
 * The brand mark: one continuous cursive stroke — entry curl, raked
 * ascender, hood loop, handlebar-arch hump, drop-hook exit — reading as
 * both a lowercase "h" and a set of drop bars. A small rust "clamp bolt"
 * accent sits at the hump peak. Stroke follows currentColor so it adapts
 * to any surface; size follows the rendered width (viewBox is 220x320,
 * ~0.6875 aspect).
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
        d="M30,260 C15,250 18,225 35,210 C55,190 60,150 58,100 C57,75 62,50 85,42 C100,37 112,48 106,68 C101,86 92,95 88,112 C84,135 84,160 88,180 C95,155 105,150 118,152 C132,154 140,165 145,190 C148,215 150,240 150,258 C150,268 155,275 165,272"
        stroke="currentColor"
        strokeWidth={16}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="118" cy="152" r="6" className="fill-rust" />
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
