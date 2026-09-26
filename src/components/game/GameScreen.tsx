import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { Chess } from "chess.js";
import { ArrowLeft, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoveBoard } from "@/components/board/MoveBoard";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { DEFAULT_ILLEGAL } from "@/components/lesson/steps/moveText";
import { useProgress } from "@/lib/progress/useProgress";
import { PROVISIONAL_GAMES, START_RATING } from "@/lib/progress/scoring";
import type { GameOutcome } from "@/lib/progress/types";
import { BOT_LEVELS, levelByRating, levelNear, type BotLevel } from "@/lib/engine/levels";
import { Engine, botMove } from "@/lib/engine/stockfish";
import { legalMoves, parseUci, turnOf, uciOf, type Color, type MoveInput } from "@/lib/chess/game";
import type { Square } from "@/lib/chess/squares";
import { moveSound, playSound } from "@/lib/sound";
import { getSettings, updateSettings, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type Side = "w" | "b" | "random";
type Phase = "setup" | "loading" | "failed" | "playing" | "over";

interface Ending {
  outcome: GameOutcome;
  reason: string;
  /** Rating change, or null for a game that was not rated. */
  delta: number | null;
}

/** A game is rated once both sides have moved, as on Lichess. */
const RATED_AFTER = 2;

/** The computer never answers faster than this, so its move can be seen. */
const MIN_THINK_MS = 350;

const SIDES: { id: Side; label: string }[] = [
  { id: "w", label: "Brancas" },
  { id: "b", label: "Pretas" },
  { id: "random", label: "Sorteio" },
];

const TITLE: Record<GameOutcome, string> = { win: "Vitória", draw: "Empate", loss: "Derrota" };

function endingOf(game: Chess, player: Color): Omit<Ending, "delta"> | null {
  if (game.isCheckmate()) return { outcome: game.turn() === player ? "loss" : "win", reason: "Xeque-mate." };
  if (game.isStalemate()) return { outcome: "draw", reason: "Afogamento." };
  if (game.isInsufficientMaterial()) return { outcome: "draw", reason: "Material insuficiente." };
  if (game.isThreefoldRepetition()) return { outcome: "draw", reason: "Mesma posição três vezes." };
  if (game.isDraw()) return { outcome: "draw", reason: "Regra dos 50 lances." };
  return null;
}

/** Resolves with `work`, but never sooner than `ms`. */
async function atLeast<T>(ms: number, work: Promise<T>): Promise<T> {
  const [value] = await Promise.all([work, new Promise((r) => window.setTimeout(r, ms))]);
  return value;
}

function sideToPlay(side: Side): Color {
  return side === "random" ? (Math.random() < 0.5 ? "w" : "b") : side;
}

export const GameScreen: FC<{ onExit: () => void }> = ({ onExit }) => {
  const { state, recordGame } = useProgress();
  const { coords } = useSettings();
  const stats = state.games;
  const rating = stats?.rating ?? START_RATING;
  const played = stats?.played ?? 0;

  const [level, setLevel] = useState<BotLevel>(() => levelByRating(getSettings().gameLevel ?? -1) ?? levelNear(rating));
  const [side, setSide] = useState<Side>(() => getSettings().gameSide ?? "w");
  const [phase, setPhase] = useState<Phase>("setup");
  const [player, setPlayer] = useState<Color>("w");
  const [fen, setFen] = useState(() => new Chess().fen());
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [illegal, setIllegal] = useState(false);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [moveCount, setMoveCount] = useState(0);

  const game = useRef(new Chess());
  const moves = useRef<string[]>([]);
  const engine = useRef<Engine | null>(null);
  // Bumped on every new game, so a reply computed for an old one is dropped.
  const gameId = useRef(0);

  useEffect(() => () => engine.current?.dispose(), []);

  const rated = moveCount >= RATED_AFTER;

  const finish = useCallback(
    (outcome: GameOutcome, reason: string) => {
      let delta: number | null = null;
      if (moves.current.length >= RATED_AFTER) {
        const before = state.games?.rating ?? START_RATING;
        const next = recordGame({ outcome, botRating: level.rating });
        delta = (next.games?.rating ?? before) - before;
        setLastDelta(delta);
      }
      if (outcome === "win") window.setTimeout(() => playSound("correct"), 160);
      if (outcome === "loss") window.setTimeout(() => playSound("wrong"), 160);
      setEnding({ outcome, reason, delta });
      setPhase("over");
    },
    [state.games, recordGame, level.rating],
  );

  const reply = async (id: number, as: Color) => {
    const eng = engine.current;
    if (!eng) return;
    setThinking(true);
    try {
      const uci = await atLeast(MIN_THINK_MS, botMove(eng, game.current.fen(), [...moves.current], level));
      if (id !== gameId.current) return;
      applyFor(as, parseUci(uci));
    } catch {
      if (id === gameId.current) setPhase("failed");
    } finally {
      if (id === gameId.current) setThinking(false);
    }
  };

  /**
   * Plays a move on the board and ends the game if it is over. The side is
   * passed in because a reply started with a new game must not read `player`
   * from an older render. Returns false once the game is over.
   */
  const applyFor = (as: Color, input: MoveInput): boolean => {
    const move = game.current.move({ from: input.from, to: input.to, promotion: input.promotion ?? "q" });
    moves.current.push(uciOf(move));
    setMoveCount(moves.current.length);
    setFen(game.current.fen());
    setLastMove([move.from as Square, move.to as Square]);
    playSound(moveSound(move));
    const end = endingOf(game.current, as);
    if (end) finish(end.outcome, end.reason);
    return !end;
  };

  const start = async () => {
    updateSettings({ gameLevel: level.rating, gameSide: side });
    const color = sideToPlay(side);
    const id = ++gameId.current;
    game.current = new Chess();
    moves.current = [];
    setMoveCount(0);
    setPlayer(color);
    setFen(game.current.fen());
    setLastMove(null);
    setEnding(null);
    setIllegal(false);
    setPhase("loading");
    try {
      engine.current?.dispose();
      engine.current = new Engine();
      await engine.current.start(level);
    } catch {
      if (id === gameId.current) setPhase("failed");
      return;
    }
    if (id !== gameId.current) return;
    setPhase("playing");
    if (color === "b") void reply(id, color);
  };

  const onMove = (input: MoveInput) => {
    if (phase !== "playing" || thinking) return;
    setIllegal(false);
    if (applyFor(player, input)) void reply(gameId.current, player);
  };

  const resign = () => {
    setConfirmResign(false);
    if (!rated) {
      gameId.current++;
      setPhase("setup");
      return;
    }
    gameId.current++;
    setThinking(false);
    finish("loss", "Você abandonou.");
  };

  const leave = () => {
    if (phase === "playing" && rated) {
      setConfirmResign(true);
      return;
    }
    gameId.current++;
    onExit();
  };

  const provisional = played < PROVISIONAL_GAMES;
  const orientation = player === "w" ? "white" : "black";
  const turn = turnOf(fen);
  const legal = phase === "playing" && !thinking && turn === player ? legalMoves(fen).map(uciOf) : [];

  let footer;
  if (phase === "setup") {
    footer = <FeedbackBar tone="neutral" actionLabel="Começar" onAction={() => void start()} />;
  } else if (phase === "loading") {
    footer = (
      <FeedbackBar
        tone="neutral"
        extra={
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando o computador
          </span>
        }
      />
    );
  } else if (phase === "failed") {
    footer = <FeedbackBar tone="wrong" title="O computador não carregou" message="Confira a conexão." actionLabel="Tentar de novo" onAction={() => void start()} />;
  } else if (phase === "over" && ending) {
    footer = (
      <FeedbackBar
        tone={ending.outcome === "win" ? "correct" : ending.outcome === "draw" ? "partial" : "wrong"}
        title={TITLE[ending.outcome]}
        message={ending.delta === null ? `${ending.reason} Partida curta demais para valer rating.` : ending.reason}
        actionLabel="Nova partida"
        onAction={() => setPhase("setup")}
        autoAdvance={false}
        extra={
          <button type="button" onClick={onExit} className="self-start text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Início
          </button>
        }
      />
    );
  } else {
    footer = (
      <FeedbackBar
        tone={illegal ? "wrong" : "neutral"}
        message={illegal ? DEFAULT_ILLEGAL : thinking ? "O computador está pensando." : undefined}
        onDismiss={() => setIllegal(false)}
        extra={
          <button
            type="button"
            onClick={() => (rated ? setConfirmResign(true) : resign())}
            className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Flag className="h-4 w-4" aria-hidden /> Abandonar
          </button>
        }
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="mx-auto flex w-full max-w-[30rem] items-center gap-1.5 px-2 pt-2">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={leave} aria-label="Voltar ao início">
          <ArrowLeft className="!h-5 !w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg font-bold leading-tight">Partida</span>
          <span className="text-xs text-muted-foreground">
            {phase === "setup" || !level ? (
              <>
                <span className="font-mono tabular">{played}</span> {played === 1 ? "partida" : "partidas"}
              </>
            ) : (
              <>
                Computador <span className="font-mono tabular">{level.rating}</span>
              </>
            )}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-[0_0_0_1px_hsl(var(--border))]" data-game-rating={rating}>
          <span className="font-mono text-base font-bold tabular">
            {rating}
            {provisional && <span className="text-muted-foreground">?</span>}
          </span>
          {lastDelta !== null && (
            <span
              key={played}
              className={cn(
                "animate-in fade-in zoom-in-90 rounded-full px-1.5 font-mono text-xs font-bold tabular duration-300",
                lastDelta >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
              )}
            >
              {lastDelta >= 0 ? `+${lastDelta}` : lastDelta}
            </span>
          )}
        </div>
      </header>

      <main
        className="min-h-0 flex-1 overflow-y-auto"
        data-game={JSON.stringify({ phase, player, turn, legal })}
      >
        <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-4 px-4 pb-6 pt-3">
          {phase === "setup" ? (
            <>
              <section className="flex flex-col gap-2" aria-labelledby="nivel">
                <h2 id="nivel" className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Nível do computador
                </h2>
                <div className="grid grid-cols-4 gap-2" role="group" aria-labelledby="nivel">
                  {BOT_LEVELS.map((l) => (
                    <button
                      key={l.rating}
                      type="button"
                      data-level={l.rating}
                      aria-pressed={l.rating === level.rating}
                      onClick={() => setLevel(l)}
                      className={cn(
                        "h-11 rounded-xl border-2 font-mono text-base font-bold tabular transition-colors",
                        l.rating === level.rating ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
                      )}
                    >
                      {l.rating}
                    </button>
                  ))}
                </div>
              </section>
              <section className="flex flex-col gap-2" aria-labelledby="lado">
                <h2 id="lado" className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Suas peças
                </h2>
                <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="lado">
                  {SIDES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      data-side={s.id}
                      aria-pressed={s.id === side}
                      onClick={() => setSide(s.id)}
                      className={cn(
                        "h-11 rounded-xl border-2 text-[15px] font-semibold transition-colors",
                        s.id === side ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-accent",
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            // The rank numbers take an 18 px column left of the board. Moving
            // it half into the page margin, and adding the same on the right,
            // leaves equal space on both sides of the board.
            <div className={coords === "outside" ? "-ml-2 pr-2.5" : undefined}>
              <MoveBoard
                spec={{ orientation }}
                fen={fen}
                playerColor={player}
                enabled={phase === "playing" && !thinking}
                lastMove={lastMove}
                onMove={onMove}
                onIllegal={() => setIllegal(true)}
              />
            </div>
          )}
        </div>
      </main>

      {footer}

      <Dialog open={confirmResign} onOpenChange={setConfirmResign}>
        <DialogContent className="max-w-[22rem] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Abandonar a partida?</DialogTitle>
            <DialogDescription>Conta como derrota no rating.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button className="h-11 w-full rounded-xl font-bold" onClick={() => setConfirmResign(false)}>
              Continuar jogando
            </Button>
            <Button variant="ghost" className="h-11 w-full rounded-xl text-danger hover:text-danger" onClick={resign}>
              Abandonar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
