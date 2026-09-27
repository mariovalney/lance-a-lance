import { useEffect, useRef, useState, type FC } from "react";
import { Chess } from "chess.js";
import { Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoveBoard } from "@/components/board/MoveBoard";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { GameHeader, GameTitle, MoveList } from "@/components/game/parts";
import { useProgress } from "@/lib/progress/useProgress";
import type { Game } from "@/lib/progress/types";
import { ApiError } from "@/lib/auth/api";
import { replay } from "@shared/games";
import type { Square } from "@/lib/chess/squares";
import { gamePgn, pgnFileName } from "@/lib/chess/pgn";
import { GLYPH, judgements } from "@shared/analysis";
import { JUDGEMENT_COLOR, JUDGEMENT_WORD } from "@/lib/chess/judgement";
import { analyseGame } from "@/lib/engine/analyse";
import { parseUci } from "@/lib/chess/game";
import { moveLabel } from "@/components/lesson/steps/moveText";
import { cn } from "@/lib/utils";
import { RichText } from "@/components/common/RichText";
import { forgetRouteState, goBack, navigate, paths, routeState } from "@/lib/router";
import { materialFor } from "@/lib/chess/material";
import { explainMove } from "@/lib/chess/explain";

/** The game after its first `ply` moves. */
function positionAt(moves: string[], ply: number) {
  const chess = replay(moves.slice(0, ply)) ?? new Chess();
  const history = chess.history({ verbose: true });
  const last = history[history.length - 1];
  return { fen: chess.fen(), lastMove: last ? ([last.from, last.to] as [Square, Square]) : null };
}

/** The engine's move in a position, as the lessons write moves: "`Nf3` (cavalo para f3)". */
function bestAt(fen: string, uci: string) {
  const move = new Chess(fen).move(parseUci(uci));
  return { from: move.from as Square, to: move.to as Square, label: moveLabel(move) };
}

/** An analysis saved before the engine's lines were kept: it judges, but cannot say why. */
const lacksLines = (g: Game) => Boolean(g.analysis?.some((e) => e.best !== null && !e.pv));

/** Where the analysis is: not run, running (how far), or failed. A finished one lives on the game. */
type Analysing = { kind: "idle" } | { kind: "running"; done: number; total: number } | { kind: "failed" };

/** Every move of a game, in SAN. */
const sansOf = (moves: string[]) => (replay(moves) ?? new Chess()).history();

type Loaded = { kind: "loading" } | { kind: "missing" } | { kind: "failed" } | { kind: "ready"; game: Game; sans: string[] };

/** Copies the game as PGN; where the clipboard is out of reach (an old browser, a page not on HTTPS), saves a file. */
async function exportPgn(game: Game): Promise<"copied" | "saved"> {
  const pgn = gamePgn(game);
  try {
    await navigator.clipboard.writeText(pgn);
    return "copied";
  } catch {
    const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = pgnFileName(game);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "saved";
  }
}

/**
 * A finished game at `/partidas/<id>`, replayed move by move. Only its owner
 * gets it from the server. Mount it keyed by the id, so another game picked in
 * the history starts clean.
 */
export const GameReview: FC<{ gameId: string }> = ({ gameId }) => {
  const { games } = useProgress();
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [ply, setPly] = useState(0);
  const [exported, setExported] = useState<"copied" | "saved" | null>(null);
  const [analysing, setAnalysing] = useState<Analysing>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  // Leaving the screen stops an analysis halfway: nothing is saved.
  useEffect(() => () => abort.current?.abort(), []);

  const analyse = async (g: Game) => {
    const controller = new AbortController();
    abort.current = controller;
    setAnalysing({ kind: "running", done: 0, total: g.moves.length + 1 });
    try {
      const analysis = await analyseGame(g.moves, (done, total) => setAnalysing({ kind: "running", done, total }), controller.signal);
      const saved = await games.saveAnalysis(g.id, analysis);
      setLoaded({ kind: "ready", game: saved, sans: sansOf(saved.moves) });
      setAnalysing({ kind: "idle" });
    } catch {
      setAnalysing(controller.signal.aborted ? { kind: "idle" } : { kind: "failed" });
    }
  };
  const cancel = () => abort.current?.abort();

  // Opened from the end of a game ("Ver análise"): the analysis starts on its
  // own as soon as the game arrives, once, and a reload does not start it again.
  const autoStart = useRef(routeState().analyse === true);
  const start = useRef(analyse);
  useEffect(() => {
    start.current = analyse;
  });

  useEffect(() => {
    let alive = true;
    games
      .get(gameId)
      .then((game) => {
        if (!alive) return;
        setLoaded({ kind: "ready", game, sans: sansOf(game.moves) });
        setPly(game.moves.length);
        if (autoStart.current) {
          autoStart.current = false;
          forgetRouteState("analyse");
          if (!game.analysis || lacksLines(game)) void start.current(game);
        }
      })
      .catch((error: unknown) => {
        if (alive) setLoaded({ kind: error instanceof ApiError && error.code === "not_found" ? "missing" : "failed" });
      });
    return () => {
      alive = false;
    };
  }, [games, gameId, attempt]);

  useEffect(() => {
    if (!exported) return;
    const t = setTimeout(() => setExported(null), 2000);
    return () => clearTimeout(t);
  }, [exported]);

  const current = loaded;
  const close = () => goBack(paths.game);
  const game = current.kind === "ready" ? current.game : null;
  const shown = game ? positionAt(game.moves, ply) : null;
  const marks = game?.analysis ? judgements(game.analysis) : [];
  // The move that led to the board shown, if the analysis judged it, and what the engine preferred there.
  const mark = ply > 0 ? marks[ply - 1] : null;
  const preferred = mark && game?.analysis?.[ply - 1]?.best ? bestAt(positionAt(game.moves, ply - 1).fen, game.analysis[ply - 1].best!) : null;
  const why = mark && game ? explainMove(game, ply) : null;
  const toAnalyse = game ? !game.analysis || lacksLines(game) : false;

  let footer;
  if (current.kind === "loading") {
    footer = (
      <FeedbackBar
        tone="neutral"
        extra={
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando
          </span>
        }
      />
    );
  } else if (current.kind === "missing") {
    footer = <FeedbackBar tone="wrong" title="Partida não encontrada." actionLabel="Voltar" onAction={() => navigate(paths.game, { replace: true })} />;
  } else if (current.kind === "failed") {
    footer = <FeedbackBar tone="wrong" title="A partida não carregou." message="Confira a conexão." actionLabel="Tentar de novo" onAction={() => setAttempt((n) => n + 1)} />;
  } else {
    const last = current.game.moves.length;
    const step = (to: number) => setPly(Math.max(0, Math.min(last, to)));
    footer = (
      <div className="border-t bg-card px-4 pt-3 pb-safe">
        <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-2">
          <div className="grid grid-cols-4 gap-2">
            <Button variant="outline" className="h-11 rounded-xl" aria-label="Início da partida" disabled={ply === 0} onClick={() => step(0)}>
              <ChevronsLeft className="!h-5 !w-5" />
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" aria-label="Lance anterior" disabled={ply === 0} onClick={() => step(ply - 1)}>
              <ChevronLeft className="!h-5 !w-5" />
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" aria-label="Próximo lance" disabled={ply === last} onClick={() => step(ply + 1)}>
              <ChevronRight className="!h-5 !w-5" />
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" aria-label="Fim da partida" disabled={ply === last} onClick={() => step(last)}>
              <ChevronsRight className="!h-5 !w-5" />
            </Button>
          </div>
          <div className={cn("grid gap-2", toAnalyse ? "grid-cols-3" : "grid-cols-2")}>
            {toAnalyse &&
              (analysing.kind === "running" ? (
                <Button variant="outline" className="h-11 rounded-xl font-bold" aria-label="Cancelar a análise" onClick={cancel}>
                  <Loader2 className="!h-4 !w-4 animate-spin" />
                  <span className="font-mono tabular">
                    {analysing.done}/{analysing.total}
                  </span>
                </Button>
              ) : (
                <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => void analyse(current.game)}>
                  <Sparkles className="!h-4 !w-4" />
                  {current.game.analysis ? "Analisar de novo" : "Analisar"}
                </Button>
              ))}
            <Button variant="outline" className="h-11 rounded-xl font-bold" onClick={() => void exportPgn(current.game).then(setExported)}>
              {exported ? <Check className="!h-4 !w-4" /> : <Copy className="!h-4 !w-4" />}
              {exported === "copied" ? "Copiado" : exported === "saved" ? "Arquivo salvo" : "Copiar PGN"}
            </Button>
            <Button className="h-11 rounded-xl font-bold" onClick={close}>
              Fechar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <GameHeader
        onBack={close}
        backLabel="Voltar para a partida"
        subtitle={game ? <GameTitle game={game} /> : "Revisão"}
        material={game && shown ? materialFor(shown.fen, game.player) : null}
      />

      <main
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-game={JSON.stringify({
          phase: current.kind === "ready" ? "review" : current.kind,
          id: game?.id ?? null,
          player: game?.player ?? "w",
          moves: game?.moves.length ?? 0,
          legal: [],
          assisted: Boolean(game?.assisted),
          hint: null,
          ply: game ? ply : null,
          analysis: analysing.kind === "running" ? "running" : game?.analysis && !toAnalyse ? "done" : analysing.kind === "failed" ? "failed" : "none",
          marks: marks.map((m) => (m ? GLYPH[m].symbol : null)),
        })}
      >
        <div className="mx-auto flex min-h-0 w-full max-w-[30rem] flex-1 flex-col gap-4 px-4 pb-4 pt-3">
          {game && shown && current.kind === "ready" && (
            <>
              <MoveBoard
                spec={{ orientation: game.player === "w" ? "white" : "black" }}
                fen={shown.fen}
                playerColor={game.player}
                enabled={false}
                lastMove={shown.lastMove}
                extraArrows={preferred ? [{ from: preferred.from, to: preferred.to, tone: "good" }] : undefined}
                balanceCoords
                onMove={() => undefined}
                onIllegal={() => undefined}
              />
              {analysing.kind === "failed" && <p className="text-sm text-muted-foreground">A análise não terminou. Tente de novo.</p>}
              {mark && (
                <p className="text-sm">
                  <span className={cn("font-bold", JUDGEMENT_COLOR[mark])}>{JUDGEMENT_WORD[mark]}.</span>
                  {preferred && (
                    <>
                      {" "}
                      <RichText text={`Melhor era ${preferred.label}.`} className="inline" />
                    </>
                  )}
                  {why && <> {why}</>}
                </p>
              )}
              <MoveList
                sans={current.sans}
                current={ply}
                onPick={setPly}
                mark={(p) => {
                  const m = marks[p - 1];
                  return m ? <span className={cn("font-bold", JUDGEMENT_COLOR[m])}>{GLYPH[m].symbol}</span> : null;
                }}
              />
            </>
          )}
        </div>
      </main>

      {footer}
    </div>
  );
};
