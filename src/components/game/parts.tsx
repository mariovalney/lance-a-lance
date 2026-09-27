import { useEffect, useRef, type FC, type ReactNode } from "react";
import { ArrowLeft, Check, History, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProgress } from "@/lib/progress/useProgress";
import { PROVISIONAL_GAMES } from "@/lib/progress/scoring";
import type { Game } from "@/lib/progress/types";
import { REASON, TITLE } from "@/components/game/text";
import { navigate, paths } from "@/lib/router";
import { cn } from "@/lib/utils";

/** What the game screen and the review share. */

/** "Computador 800 · assistida" */
export const GameTitle: FC<{ game: Game }> = ({ game }) => (
  <>
    Computador <span className="font-mono tabular">{game.level}</span>
    {game.assisted ? " · assistida" : ""}
  </>
);

/**
 * The top of the game screens: back, the title, the way to the finished games
 * (on the setup only), the material balance and the game rating.
 */
export const GameHeader: FC<{
  onBack: () => void;
  backLabel: string;
  subtitle: ReactNode;
  /** The rating change of the game just finished, if any. */
  delta?: number | null;
  /** Changes when a game finishes, so the delta animates. */
  version?: number;
  /** A way to the history of finished games; only where a new game is set up. */
  history?: boolean;
  /** The player's material balance on the board shown, when a board is shown. */
  material?: number | null;
}> = ({ onBack, backLabel, subtitle, delta = null, version = 0, history = false, material = null }) => {
  const { state } = useProgress();
  const stats = state.games;
  const provisional = stats.played < PROVISIONAL_GAMES;

  return (
    <header className="mx-auto flex w-full max-w-[30rem] items-center gap-1.5 px-2 pt-2">
      <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={onBack} aria-label={backLabel}>
        <ArrowLeft className="!h-5 !w-5" />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-lg font-bold leading-tight">Partida</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      {history && (
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={() => navigate(paths.games)} aria-label="Partidas anteriores">
          <History className="!h-5 !w-5" />
        </Button>
      )}
      {material !== null && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1.5 font-mono text-base font-bold tabular",
            material > 0 ? "bg-success-soft text-success" : material < 0 ? "bg-danger-soft text-danger" : "bg-card shadow-[0_0_0_1px_hsl(var(--border))]",
          )}
          aria-label={`Saldo de material: ${material > 0 ? "+" : ""}${material}`}
          data-material={material}
        >
          {material > 0 ? `+${material}` : material}
        </span>
      )}
      <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-[0_0_0_1px_hsl(var(--border))]" data-game-rating={stats.rating}>
        <span className="font-mono text-base font-bold tabular">
          {stats.rating}
          {provisional && <span className="text-muted-foreground">?</span>}
        </span>
        {delta !== null && (
          <span
            key={version}
            className={cn(
              "animate-in fade-in zoom-in-90 rounded-full px-1.5 font-mono text-xs font-bold tabular duration-300",
              delta >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {delta >= 0 ? `+${delta}` : delta}
          </span>
        )}
      </div>

    </header>
  );
};

/**
 * The moves in pairs under the board, in a list that scrolls on its own so the
 * board keeps its place. `current` is the ply the board shows (0 is the
 * initial position); `onPick` makes the moves tappable, as in a review.
 */
export const MoveList: FC<{
  sans: string[];
  current: number;
  onPick?: (ply: number) => void;
  /** Drawn after a move's SAN, such as its judgement. */
  mark?: (ply: number) => ReactNode;
}> = ({ sans, current, onPick, mark }) => {
  const list = useRef<HTMLOListElement>(null);

  // Keeps the current move in view by scrolling the list alone, never the
  // screen. Again when the list changes height, as it does when the footer
  // grows at the end of a game.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const keepInView = () => {
      const move = el.querySelector<HTMLElement>("[data-current]");
      if (!move) return;
      if (move.offsetTop < el.scrollTop) el.scrollTop = move.offsetTop - 8;
      else if (move.offsetTop + move.offsetHeight > el.scrollTop + el.clientHeight) el.scrollTop = move.offsetTop + move.offsetHeight - el.clientHeight + 8;
    };
    keepInView();
    const resized = new ResizeObserver(keepInView);
    resized.observe(el);
    return () => resized.disconnect();
  }, [current, sans.length]);

  if (!sans.length) return null;
  return (
    <ol
      ref={list}
      className="relative grid min-h-[4.5rem] flex-1 grid-cols-[2rem_5.5rem_1fr] content-start gap-x-2 gap-y-1 overflow-y-auto rounded-xl border bg-card px-3.5 py-2.5 font-mono text-sm tabular"
      aria-label="Lances da partida"
    >
      {Array.from({ length: Math.ceil(sans.length / 2) }, (_, i) => (
        <li key={i} className="contents">
          <span className="text-muted-foreground">{i + 1}.</span>
          {[2 * i, 2 * i + 1].map((ply) =>
            ply < sans.length ? (
              <button
                key={ply}
                type="button"
                disabled={!onPick}
                data-current={current === ply + 1 || undefined}
                onClick={() => onPick?.(ply + 1)}
                className={cn("justify-self-start rounded px-1 -mx-1 text-left disabled:cursor-default", current === ply + 1 && "font-bold", onPick && "hover:bg-accent")}
              >
                {sans[ply]}
                {mark?.(ply + 1)}
              </button>
            ) : (
              <span key={ply} />
            ),
          )}
        </li>
      ))}
    </ol>
  );
};

/** One finished game in the history; tapping it opens the review. */
export const GameRow: FC<{ game: Game; onPick: () => void }> = ({ game: g, onPick }) => {
  if (!g.outcome || !g.reason || !g.finishedAt) return null;
  const Icon = g.outcome === "win" ? Check : g.outcome === "draw" ? Minus : X;
  const moves = Math.ceil(g.moves.length / 2);
  return (
    <button type="button" onClick={onPick} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent">
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full",
          g.outcome === "win" ? "bg-success-soft text-success" : g.outcome === "loss" ? "bg-danger-soft text-danger" : "bg-secondary text-muted-foreground",
        )}
        aria-label={TITLE[g.outcome]}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">
          {TITLE[g.outcome]} contra o computador <span className="font-mono tabular">{g.level}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {REASON[g.reason]} {moves} {moves === 1 ? "lance" : "lances"} · {new Date(g.finishedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
        </span>
      </span>
      {g.ratingDelta !== null && g.ratingAfter !== null && (
        <span className="flex flex-col items-end">
          <span className={cn("font-mono text-sm font-bold tabular", g.ratingDelta >= 0 ? "text-success" : "text-danger")}>
            {g.ratingDelta >= 0 ? `+${g.ratingDelta}` : g.ratingDelta}
          </span>
          <span className="font-mono text-[11px] tabular text-muted-foreground">{g.ratingAfter}</span>
        </span>
      )}
    </button>
  );
};
