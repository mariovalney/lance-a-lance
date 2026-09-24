import type { FC } from "react";
import { Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProgress } from "@/lib/progress/ProgressContext";
import { PROVISIONAL_GAMES, START_RATING } from "@/lib/progress/scoring";

export const PuzzleCard: FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { state } = useProgress();
  const stats = state.puzzles;
  const rating = stats?.rating ?? START_RATING;
  const provisional = (stats?.played ?? 0) < PROVISIONAL_GAMES;
  return (
    <section className="flex items-center gap-3 rounded-2xl border bg-card p-3.5" aria-label="Treino de puzzles">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold" aria-hidden>
        <Puzzle className="h-5 w-5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-base font-bold leading-tight">Treino de puzzles</span>
        <span className="text-sm text-muted-foreground">
          Rating <span className="font-mono font-semibold tabular text-foreground">{rating}{provisional ? "?" : ""}</span>
          {stats ? (
            <>
              {" "}· <span className="font-mono tabular">{stats.solved}</span> {stats.solved === 1 ? "resolvido" : "resolvidos"}
            </>
          ) : (
            " · puzzles reais do Lichess"
          )}
        </span>
      </div>
      <Button onClick={onOpen} className="h-10 shrink-0 rounded-xl px-4 font-bold">
        Treinar
      </Button>
    </section>
  );
};
