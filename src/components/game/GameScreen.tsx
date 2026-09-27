import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { Chess } from "chess.js";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Flag, History, Loader2, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MoveBoard } from "@/components/board/MoveBoard";
import { HistorySheet } from "@/components/common/HistorySheet";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { DEFAULT_ILLEGAL, moveLabel } from "@/components/lesson/steps/moveText";
import { useProgress } from "@/lib/progress/useProgress";
import { PROVISIONAL_GAMES } from "@/lib/progress/scoring";
import type { Game, GameEndReason, GameOutcome } from "@/lib/progress/types";
import { RATED_AFTER, isRatedGame } from "@shared/scoring";
import { endOf, replay } from "@shared/games";
import { BOT_LEVELS, levelByRating, levelNear, type BotLevel } from "@/lib/engine/levels";
import { useGameEngines } from "@/lib/engine/useGameEngines";
import { legalMoves, parseUci, turnOf, uciOf, type Color, type MoveInput } from "@/lib/chess/game";
import type { Square } from "@/lib/chess/squares";
import { moveSound, playSound } from "@/lib/sound";
import { getSettings, updateSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { gamePgn, pgnFileName } from "@/lib/chess/pgn";

type Side = "w" | "b" | "random";
/** `saving` covers starting, finishing and calling off: the server has to answer first. */
type Phase = "setup" | "loading" | "playing" | "saving" | "over" | "failed" | "review";
type Failure = "start" | "engine" | "finish" | "calloff";

/** The engine's suggestion in an assisted game. */
interface Hint {
  from: Square;
  to: Square;
  /** "`Nf3` (cavalo para f3)" */
  label: string;
}

/** The computer never answers faster than this, so its move can be seen. */
const MIN_THINK_MS = 350;

const SIDES: { id: Side; label: string }[] = [
  { id: "w", label: "Brancas" },
  { id: "b", label: "Pretas" },
  { id: "random", label: "Sorteio" },
];

const TITLE: Record<GameOutcome, string> = { win: "Vitória", draw: "Empate", loss: "Derrota" };

const REASON: Record<GameEndReason, string> = {
  checkmate: "Xeque-mate.",
  stalemate: "Afogamento.",
  insufficient: "Material insuficiente.",
  repetition: "Mesma posição três vezes.",
  fifty: "Regra dos 50 lances.",
  resigned: "Você abandonou.",
};

const FAILURE: Record<Failure, string> = {
  start: "A partida não começou.",
  engine: "O computador não carregou.",
  finish: "O resultado não foi salvo.",
  calloff: "A partida não foi cancelada.",
};

/** Resolves with `work`, but never sooner than `ms`. */
async function atLeast<T>(ms: number, work: Promise<T>): Promise<T> {
  const [value] = await Promise.all([work, new Promise((r) => window.setTimeout(r, ms))]);
  return value;
}

function sideToPlay(side: Side): Color {
  return side === "random" ? (Math.random() < 0.5 ? "w" : "b") : side;
}

const levelOf = (rating: number): BotLevel => levelByRating(rating) ?? levelNear(rating);

/** What the board and the move list show for a game after some of its moves. */
function boardAt(moves: string[]) {
  const chess = replay(moves) ?? new Chess();
  const history = chess.history({ verbose: true });
  const last = history[history.length - 1];
  return {
    chess,
    fen: chess.fen(),
    sans: history.map((m) => m.san),
    lastMove: last ? ([last.from, last.to] as [Square, Square]) : null,
  };
}

export const GameScreen: FC<{ onExit: () => void }> = ({ onExit }) => {
  const { state, games } = useProgress();
  const stats = state.games;
  const engines = useGameEngines();

  // A game in progress picks up where it was, after a reload or on another device.
  const [initial] = useState(() => stats.current);
  const [level, setLevel] = useState<BotLevel>(() => levelByRating(getSettings().gameLevel ?? -1) ?? levelNear(stats.rating));
  const [side, setSide] = useState<Side>(() => getSettings().gameSide ?? "w");
  const [assisted, setAssisted] = useState(() => getSettings().gameAssisted ?? false);
  const [phase, setPhase] = useState<Phase>(initial ? "loading" : "setup");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [game, setGame] = useState<Game | null>(initial);
  const [board, setBoard] = useState(() => boardAt(initial?.moves ?? []));
  const [thinking, setThinking] = useState(false);
  const [illegal, setIllegal] = useState(false);
  const [hint, setHint] = useState<Hint | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [finished, setFinished] = useState(0);
  const [review, setReview] = useState<{ game: Game; ply: number } | null>(null);

  // The game being played, read by the async replies so they never see an
  // older render's values. `game` mirrors it for rendering.
  const current = useRef<Game | null>(initial);
  const chess = useRef(board.chess);
  const resigned = useRef(false);
  // Bumped on every new game, so a reply computed for an old one is dropped.
  const gameId = useRef(0);
  const moveList = useRef<HTMLOListElement>(null);

  const shownSans = review ? boardAt(review.game.moves).sans : board.sans;
  const highlighted = review ? review.ply : shownSans.length;
  // Keeps the current move in view by scrolling the list alone, never the
  // screen: the board stays where it is. Again when the list changes height,
  // as it does when the footer grows at the end of a game.
  useEffect(() => {
    const list = moveList.current;
    if (!list) return;
    const keepInView = () => {
      const move = list.querySelector<HTMLElement>("[data-current]");
      if (!move) return;
      if (move.offsetTop < list.scrollTop) list.scrollTop = move.offsetTop - 8;
      else if (move.offsetTop + move.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = move.offsetTop + move.offsetHeight - list.clientHeight + 8;
    };
    keepInView();
    const resized = new ResizeObserver(keepInView);
    resized.observe(list);
    return () => resized.disconnect();
  }, [highlighted, shownSans.length]);

  /** Hands the end to the server, which reads the result off the final position. */
  const finish = useCallback(
    async (resign: boolean) => {
      const g = current.current;
      if (!g) return;
      resigned.current = resign;
      setHint(null);
      setThinking(false);
      setPhase("saving");
      try {
        const done = await games.finish(g.id, g.moves, resign);
        current.current = null;
        setGame(done);
        setFinished((n) => n + 1);
        if (done.ratingDelta !== null) setLastDelta(done.ratingDelta);
        if (done.outcome === "win") playSound("correct");
        if (done.outcome === "loss") playSound("wrong");
        setPhase("over");
      } catch {
        setFailure("finish");
        setPhase("failed");
      }
    },
    [games],
  );

  /** Plays a move on the board and saves it, or ends the game. Returns false once it is over. */
  const apply = useCallback(
    (input: MoveInput): boolean => {
      const g = current.current!;
      const move = chess.current.move({ from: input.from, to: input.to, promotion: input.promotion ?? "q" });
      const next = { ...g, moves: [...g.moves, uciOf(move)] };
      current.current = next;
      setGame(next);
      setBoard({ ...boardAt(next.moves), chess: chess.current });
      playSound(moveSound(move));
      if (endOf(chess.current, g.player)) {
        void finish(false);
        return false;
      }
      games.saveMoves(next.id, next.moves);
      return true;
    },
    [games, finish],
  );

  /** The full-strength engine's move for the player, shown as an arrow. */
  const suggest = useCallback(
    async (id: number) => {
      const g = current.current;
      if (!g?.assisted) return;
      setHint(null);
      try {
        const uci = await engines.best([...g.moves]);
        if (!uci || id !== gameId.current || current.current?.moves.length !== g.moves.length) return;
        const move = new Chess(chess.current.fen()).move(parseUci(uci));
        setHint({ from: move.from as Square, to: move.to as Square, label: moveLabel(move) });
      } catch {
        /* no hint this move */
      }
    },
    [engines],
  );

  const reply = useCallback(
    async (id: number) => {
      const g = current.current;
      if (!g) return;
      setThinking(true);
      try {
        const uci = await atLeast(MIN_THINK_MS, engines.reply(chess.current.fen(), [...g.moves]));
        if (id !== gameId.current) return;
        if (apply(parseUci(uci))) void suggest(id);
      } catch {
        if (id !== gameId.current) return;
        setFailure("engine");
        setPhase("failed");
      } finally {
        if (id === gameId.current) setThinking(false);
      }
    },
    [engines, apply, suggest],
  );

  /** Loads the engines for the game on the board and hands the turn to whoever has it. */
  const boot = useCallback(
    async (g: Game) => {
      const id = ++gameId.current;
      try {
        await engines.load(levelOf(g.level), g.assisted);
      } catch {
        if (id !== gameId.current) return;
        setFailure("engine");
        setPhase("failed");
        return;
      }
      if (id !== gameId.current) return;
      setPhase("playing");
      if (chess.current.turn() !== g.player) void reply(id);
      else void suggest(id);
    },
    [engines, reply, suggest],
  );

  // The saved game's board is already in the initial state; only its engines are left.
  useEffect(() => {
    if (initial) void boot(initial);
  }, [initial, boot]);

  /** Puts a game on the board and loads its engines. */
  const show = (g: Game) => {
    const b = boardAt(g.moves);
    chess.current = b.chess;
    current.current = g;
    setGame(g);
    setBoard(b);
    setHint(null);
    setIllegal(false);
    setFailure(null);
    setPhase("loading");
    void boot(g);
  };

  const start = async () => {
    updateSettings({ gameLevel: level.rating, gameSide: side, gameAssisted: assisted });
    setFailure(null);
    setPhase("saving");
    try {
      show(await games.start({ level: level.rating, player: sideToPlay(side), assisted }));
    } catch {
      setFailure("start");
      setPhase("failed");
    }
  };

  const onMove = (input: MoveInput) => {
    if (phase !== "playing" || thinking) return;
    setIllegal(false);
    setHint(null);
    if (apply(input)) void reply(gameId.current);
  };

  const resign = async () => {
    setConfirmResign(false);
    const g = current.current;
    if (!g) return;
    gameId.current++;
    setThinking(false);
    if (g.moves.length >= RATED_AFTER) return finish(true);
    // Nothing to rate yet: the game is called off and leaves no trace.
    setPhase("saving");
    try {
      await games.callOff(g.id);
      current.current = null;
      setGame(null);
      setPhase("setup");
    } catch {
      setFailure("calloff");
      setPhase("failed");
    }
  };

  const retry = () => {
    if (failure === "start") void start();
    else if (failure === "finish") void finish(resigned.current);
    else if (failure === "calloff") void resign();
    else if (current.current) show(current.current);
    else setPhase("setup");
  };

  const openReview = (g: Game) => {
    setHistoryOpen(false);
    setReview({ game: g, ply: g.moves.length });
    setPhase("review");
  };

  // Copies the reviewed game as PGN; where the clipboard is out of reach
  // (an old browser, a page not served over HTTPS), saves it as a file.
  const [exported, setExported] = useState<"copied" | "saved" | null>(null);
  const exportPgn = async (g: Game) => {
    const pgn = gamePgn(g);
    try {
      await navigator.clipboard.writeText(pgn);
      setExported("copied");
    } catch {
      const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = pgnFileName(g);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExported("saved");
    }
  };
  useEffect(() => {
    if (!exported) return;
    const t = setTimeout(() => setExported(null), 2000);
    return () => clearTimeout(t);
  }, [exported]);

  const closeReview = () => {
    setReview(null);
    setPhase(current.current ? "playing" : "setup");
  };

  const provisional = stats.played < PROVISIONAL_GAMES;
  const player: Color = review?.game.player ?? game?.player ?? "w";
  const shown = review ? boardAt(review.game.moves.slice(0, review.ply)) : board;
  const turn = turnOf(shown.fen);
  const legal = phase === "playing" && !thinking && turn === player ? legalMoves(shown.fen).map(uciOf) : [];
  const rated = game ? isRatedGame(game.assisted, game.moves.length) : false;
  const headerGame = review?.game ?? (phase === "setup" ? null : game);

  let footer;
  if (phase === "setup") {
    footer = <FeedbackBar tone="neutral" actionLabel="Começar" onAction={() => void start()} />;
  } else if (phase === "loading" || phase === "saving") {
    footer = (
      <FeedbackBar
        tone="neutral"
        extra={
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {phase === "loading" ? "Carregando o computador" : "Salvando"}
          </span>
        }
      />
    );
  } else if (phase === "failed" && failure) {
    footer = <FeedbackBar tone="wrong" title={FAILURE[failure]} message="Confira a conexão." actionLabel="Tentar de novo" onAction={retry} />;
  } else if (phase === "over" && game?.outcome && game.reason) {
    const unrated = game.assisted ? " Partida assistida não vale rating." : " Partida curta demais para valer rating.";
    footer = (
      <FeedbackBar
        tone={game.outcome === "win" ? "correct" : game.outcome === "draw" ? "partial" : "wrong"}
        title={TITLE[game.outcome]}
        message={game.ratingDelta === null ? `${REASON[game.reason]}${unrated}` : REASON[game.reason]}
        actionLabel="Nova partida"
        onAction={() => setPhase("setup")}
        autoAdvance={false}
      />
    );
  } else if (phase === "review" && review) {
    const last = review.game.moves.length;
    const step = (ply: number) => setReview({ ...review, ply: Math.max(0, Math.min(last, ply)) });
    footer = (
      <div className="border-t bg-card px-4 pt-3 pb-safe">
        <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-2">
          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" className="h-11 rounded-xl" aria-label="Início da partida" disabled={review.ply === 0} onClick={() => step(0)}>
              <ChevronsLeft className="!h-5 !w-5" />
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" aria-label="Lance anterior" disabled={review.ply === 0} onClick={() => step(review.ply - 1)}>
              <ChevronLeft className="!h-5 !w-5" />
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" aria-label="Próximo lance" disabled={review.ply === last} onClick={() => step(review.ply + 1)}>
              <ChevronRight className="!h-5 !w-5" />
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" aria-label="Fim da partida" disabled={review.ply === last} onClick={() => step(last)}>
              <ChevronsRight className="!h-5 !w-5" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => void exportPgn(review.game)}>
              {exported ? <Check className="!h-4 !w-4" /> : <Copy className="!h-4 !w-4" />}
              {exported === "copied" ? "Copiado" : exported === "saved" ? "Arquivo salvo" : "Copiar PGN"}
            </Button>
            <Button className="h-11 rounded-xl font-bold" onClick={closeReview}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    );
  } else {
    const assistText = game?.assisted && turn === player && !thinking ? (hint ? `Melhor lance: ${hint.label}.` : "Calculando o melhor lance.") : undefined;
    footer = (
      <FeedbackBar
        tone={illegal ? "wrong" : "neutral"}
        message={illegal ? DEFAULT_ILLEGAL : thinking ? "O computador está pensando." : assistText}
        onDismiss={() => setIllegal(false)}
        extra={
          <button
            type="button"
            onClick={() => (rated ? setConfirmResign(true) : void resign())}
            className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Flag className="h-4 w-4" aria-hidden /> Abandonar
          </button>
        }
      />
    );
  }

  // A review lists the whole game and marks where the board is.
  const sans = shownSans;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="mx-auto flex w-full max-w-[30rem] items-center gap-1.5 px-2 pt-2">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={review ? closeReview : onExit} aria-label="Voltar ao início">
          <ArrowLeft className="!h-5 !w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg font-bold leading-tight">Partida</span>
          <span className="text-xs text-muted-foreground">
            {headerGame ? (
              <>
                Computador <span className="font-mono tabular">{headerGame.level}</span>
                {headerGame.assisted ? " · assistida" : ""}
              </>
            ) : (
              <>
                <span className="font-mono tabular">{stats.played}</span> {stats.played === 1 ? "partida" : "partidas"}
              </>
            )}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={() => setHistoryOpen(true)} aria-label="Partidas anteriores">
          <History className="!h-5 !w-5" />
        </Button>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-[0_0_0_1px_hsl(var(--border))]" data-game-rating={stats.rating}>
          <span className="font-mono text-base font-bold tabular">
            {stats.rating}
            {provisional && <span className="text-muted-foreground">?</span>}
          </span>
          {lastDelta !== null && (
            <span
              key={finished}
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
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-game={JSON.stringify({
          phase,
          player,
          turn,
          legal,
          moves: sans.length,
          assisted: Boolean(game?.assisted),
          hint: hint ? `${hint.from}${hint.to}` : null,
          ply: review?.ply ?? null,
        })}
      >
        {/* In a game the screen holds still: the board keeps its place and
            only the move list scrolls, in whatever height is left. */}
        <div className={cn("mx-auto flex w-full max-w-[30rem] flex-col gap-4 px-4 pt-3", phase === "setup" ? "pb-6" : "min-h-0 flex-1 pb-4")}>
          {phase === "setup" ? (
            <GameSetup level={level} onLevel={setLevel} side={side} onSide={setSide} assisted={assisted} onAssisted={setAssisted} />
          ) : (
            <>
              <MoveBoard
                spec={{ orientation: player === "w" ? "white" : "black" }}
                fen={shown.fen}
                playerColor={player}
                enabled={phase === "playing" && !thinking}
                lastMove={shown.lastMove}
                extraArrows={hint && phase === "playing" ? [{ from: hint.from, to: hint.to, tone: "good" }] : undefined}
                balanceCoords
                onMove={onMove}
                onIllegal={() => setIllegal(true)}
              />
              {sans.length > 0 && (
                <ol
                  ref={moveList}
                  className="relative grid min-h-[4.5rem] flex-1 grid-cols-[2rem_4.5rem_1fr] content-start gap-x-2 gap-y-1 overflow-y-auto rounded-xl border bg-card px-3.5 py-2.5 font-mono text-sm tabular"
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
                            disabled={!review}
                            data-current={highlighted === ply + 1 || undefined}
                            onClick={() => review && setReview({ ...review, ply: ply + 1 })}
                            className={cn("justify-self-start rounded px-1 -mx-1 text-left disabled:cursor-default", highlighted === ply + 1 && "font-bold", review && "hover:bg-accent")}
                          >
                            {sans[ply]}
                          </button>
                        ) : (
                          <span key={ply} />
                        ),
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      </main>

      {footer}

      <HistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        description="Toque numa partida para rever os lances."
        empty="Nenhuma partida ainda."
        version={finished}
        load={games.page}
        keyOf={(g) => g.id}
        render={(g) => <GameRow game={g} onPick={openReview} />}
      />

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
            <Button variant="ghost" className="h-11 w-full rounded-xl text-danger hover:text-danger" onClick={() => void resign()}>
              Abandonar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const GameSetup: FC<{
  level: BotLevel;
  onLevel: (l: BotLevel) => void;
  side: Side;
  onSide: (s: Side) => void;
  assisted: boolean;
  onAssisted: (v: boolean) => void;
}> = ({ level, onLevel, side, onSide, assisted, onAssisted }) => (
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
            onClick={() => onLevel(l)}
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
            onClick={() => onSide(s.id)}
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
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card px-3.5 py-3">
      <Label htmlFor="game-assisted" className="flex flex-col gap-0.5 text-[15px]">
        Partida assistida
        <span className="text-xs font-normal text-muted-foreground">Mostra o melhor lance a cada jogada. Não vale rating.</span>
      </Label>
      <Switch id="game-assisted" checked={assisted} onCheckedChange={onAssisted} />
    </div>
  </>
);

/** One finished game in the history; tapping it opens the review. */
const GameRow: FC<{ game: Game; onPick: (g: Game) => void }> = ({ game: g, onPick }) => {
  if (!g.outcome || !g.reason || !g.finishedAt) return null;
  const Icon = g.outcome === "win" ? Check : g.outcome === "draw" ? Minus : X;
  const moves = Math.ceil(g.moves.length / 2);
  return (
    <button type="button" onClick={() => onPick(g)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent">
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
          {REASON[g.reason]} {moves} {moves === 1 ? "lance" : "lances"}
          {g.assisted ? " · assistida" : ""} · {new Date(g.finishedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
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
