import { useCallback, useEffect, useRef, useState, type FC } from "react";
import { Chess } from "chess.js";
import { Flag, Loader2, Sparkles } from "lucide-react";
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
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { DEFAULT_ILLEGAL, moveLabel } from "@/components/lesson/steps/moveText";
import { useProgress } from "@/lib/progress/useProgress";
import type { Game } from "@/lib/progress/types";
import { RATED_AFTER, isRatedGame } from "@shared/scoring";
import { endOf, replay } from "@shared/games";
import { BOT_LEVELS, levelByRating, levelNear, type BotLevel } from "@/lib/engine/levels";
import { useGameEngines } from "@/lib/engine/useGameEngines";
import { legalMoves, parseUci, turnOf, uciOf, type Color, type MoveInput } from "@/lib/chess/game";
import type { Square } from "@/lib/chess/squares";
import { moveSound, playSound } from "@/lib/sound";
import { getSettings, updateSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { goBack, navigate, paths } from "@/lib/router";
import { materialFor } from "@/lib/chess/material";
import { GameHeader, GameTitle, MoveList } from "@/components/game/parts";
import { REASON, TITLE } from "@/components/game/text";

type Side = "w" | "b" | "random";
/** `saving` covers starting, finishing and calling off: the server has to answer first. */
type Phase = "setup" | "loading" | "playing" | "saving" | "over" | "failed";
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

/** A game against the computer at `/partida`: the one in progress, or the setup for a new one. */
export const GameScreen: FC = () => {
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
  const [finished, setFinished] = useState(0);

  // The game being played, read by the async replies so they never see an
  // older render's values. `game` mirrors it for rendering.
  const current = useRef<Game | null>(initial);
  const chess = useRef(board.chess);
  const resigned = useRef(false);
  // Bumped on every new game, so a reply computed for an old one is dropped.
  const gameId = useRef(0);
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

  const player: Color = game?.player ?? "w";
  const turn = turnOf(board.fen);
  const legal = phase === "playing" && !thinking && turn === player ? legalMoves(board.fen).map(uciOf) : [];
  const rated = game ? isRatedGame(game.assisted, game.moves.length) : false;
  const headerGame = phase === "setup" ? null : game;

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
        extra={
          <button
            type="button"
            onClick={() => navigate(paths.gameReview(game.id), { state: { analyse: true } })}
            className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Ver análise
          </button>
        }
      />
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

  return (
    <div className="flex h-full flex-col bg-background">
      <GameHeader
        onBack={() => goBack(paths.home)}
        backLabel="Voltar ao início"
        subtitle={
          headerGame ? (
            <GameTitle game={headerGame} />
          ) : (
            <>
              <span className="font-mono tabular">{stats.played}</span> {stats.played === 1 ? "partida" : "partidas"}
            </>
          )
        }
        delta={lastDelta}
        version={finished}
        history={phase === "setup"}
        material={phase === "setup" ? null : materialFor(board.fen, player)}
      />

      <main
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-game={JSON.stringify({
          phase,
          player,
          turn,
          legal,
          moves: board.sans.length,
          assisted: Boolean(game?.assisted),
          hint: hint ? `${hint.from}${hint.to}` : null,
          ply: null,
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
                fen={board.fen}
                playerColor={player}
                enabled={phase === "playing" && !thinking}
                lastMove={board.lastMove}
                extraArrows={hint && phase === "playing" ? [{ from: hint.from, to: hint.to, tone: "good" }] : undefined}
                balanceCoords
                onMove={onMove}
                onIllegal={() => setIllegal(true)}
              />
              <MoveList sans={board.sans} current={board.sans.length} />
            </>
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
