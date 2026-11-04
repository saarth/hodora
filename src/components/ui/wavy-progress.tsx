import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Material 3 Expressive wavy progress indicator.
 * Renders an indeterminate wavy bar.
 */
export function WavyProgress({ className }: { className?: string }) {
  return (
    <div className={cn("m3-wavy-track w-full", className)} role="progressbar" aria-indeterminate="true">
      <div className="m3-wavy-bar" />
    </div>
  );
}

export default WavyProgress;