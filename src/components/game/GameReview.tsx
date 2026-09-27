import { useEffect, useState, type FC } from "react";
import { Chess } from "chess.js";
import { Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Loader2 } from "lucide-react";
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
import { goBack, navigate, paths } from "@/lib/router";

/** The game after its first `ply` moves. */
function positionAt(moves: string[], ply: number) {
  const chess = replay(moves.slice(0, ply)) ?? new Chess();
  const history = chess.history({ verbose: true });
  const last = history[history.length - 1];
  return { fen: chess.fen(), lastMove: last ? ([last.from, last.to] as [Square, Square]) : null };
}

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

  useEffect(() => {
    let alive = true;
    games
      .get(gameId)
      .then((game) => {
        if (!alive) return;
        setLoaded({ kind: "ready", game, sans: sansOf(game.moves) });
        setPly(game.moves.length);
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
          <div className="grid grid-cols-2 gap-2">
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
      <GameHeader onBack={close} backLabel="Voltar para a partida" subtitle={game ? <GameTitle game={game} /> : "Revisão"} />

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
                balanceCoords
                onMove={() => undefined}
                onIllegal={() => undefined}
              />
              <MoveList sans={current.sans} current={ply} onPick={setPly} />
            </>
          )}
        </div>
      </main>

      {footer}
    </div>
  );
};
