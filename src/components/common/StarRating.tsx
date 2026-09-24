import type { FC } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  size?: "sm" | "lg";
  animate?: boolean;
  className?: string;
}

export const StarRating: FC<StarRatingProps> = ({ value, size = "sm", animate = false, className }) => {
  const px = size === "lg" ? "h-10 w-10" : "h-3.5 w-3.5";
  return (
    <span className={cn("inline-flex items-center gap-0.5", size === "lg" && "gap-2", className)} aria-label={`${value} de 3 estrelas`}>
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          className={cn(
            px,
            n <= value ? "fill-gold text-gold" : "fill-transparent text-muted-foreground/40",
            animate && n <= value && "animate-pop-in",
          )}
          style={animate ? { animationDelay: `${n * 180}ms` } : undefined}
          strokeWidth={size === "lg" ? 1.5 : 2}
        />
      ))}
    </span>
  );
};
