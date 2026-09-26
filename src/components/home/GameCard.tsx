import type { FC } from "react";
import { Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProgress } from "@/lib/progress/useProgress";
import { PROVISIONAL_GAMES, START_RATING } from "@/lib/progress/scoring";

export const GameCard: FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { state } = useProgress();
  const stats = state.games;
  const rating = stats?.rating ?? START_RATING;
  const provisional = (stats?.played ?? 0) < PROVISIONAL_GAMES;
  return (
    <section className="flex items-center gap-3 rounded-2xl border bg-card p-3.5" aria-label="Partida contra o computador">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden>
        <Swords className="h-5 w-5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-base font-bold leading-tight">Partida</span>
        <span className="text-sm text-muted-foreground">
          Rating <span className="font-mono font-semibold tabular text-foreground">{rating}{provisional ? "?" : ""}</span>
          {stats && (
            <>
              {" "}· <span className="font-mono tabular">{stats.played}</span> {stats.played === 1 ? "partida" : "partidas"}
            </>
          )}
        </span>
      </div>
      <Button onClick={onOpen} className="h-10 shrink-0 rounded-xl px-4 font-bold">
        Jogar
      </Button>
    </section>
  );
};
