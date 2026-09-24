import type { FC } from "react";
import { cn } from "@/lib/utils";
import { CoordChip } from "@/components/common/CoordChip";

interface RichTextProps {
  text: string;
  className?: string;
  chipTone?: "default" | "inverse";
}

/** Renders `code` as coordinate chips and **bold** as strong text. */
export const RichText: FC<RichTextProps> = ({ text, className, chipTone = "default" }) => {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <span className={cn(className)}>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`")) {
          return <CoordChip key={i} value={part.slice(1, -1)} tone={chipTone} />;
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};
