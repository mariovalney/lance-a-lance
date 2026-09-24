import type * as React from "react";
import type { FC } from "react";
import { cn } from "@/lib/utils";

interface CoordChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: string;
  tone?: "default" | "inverse";
}

/** Monospace chip for coordinates and notation, e.g. e4 or Nf3. */
export const CoordChip: FC<CoordChipProps> = ({ value, tone = "default", className, ...rest }) => (
  <span
    {...rest}
    className={cn(
      "mx-[0.1em] inline-flex items-center rounded-md px-[0.4em] py-[0.05em] align-baseline font-mono text-[0.92em] font-semibold leading-snug",
      tone === "default" ? "bg-secondary text-foreground" : "bg-foreground/10 text-current",
      className,
    )}
  >
    {value}
  </span>
);
