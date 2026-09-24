import type { FC } from "react";
import { FILES, RANKS, isLight, type Square } from "@/lib/chess/squares";
import { cn } from "@/lib/utils";

interface MiniBoardProps {
  highlight?: Square[];
  className?: string;
}

/** Tiny decorative board (no pieces), used as a thumbnail. */
export const MiniBoard: FC<MiniBoardProps> = ({ highlight = [], className }) => (
  <div className={cn("grid aspect-square grid-cols-8 overflow-hidden rounded-md", className)} aria-hidden>
    {[...RANKS].reverse().map((r) =>
      FILES.map((f) => {
        const sq = `${f}${r}` as Square;
        const on = highlight.includes(sq);
        return (
          <div
            key={sq}
            style={{
              background: on ? "hsl(var(--gold))" : isLight(sq) ? "var(--board-light)" : "var(--board-dark)",
            }}
          />
        );
      }),
    )}
  </div>
);
