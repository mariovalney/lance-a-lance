import { UCI, replay } from "@shared/games";
import { MAX_CP, MAX_MATE, MAX_PV } from "@shared/analysis";
import type { PositionEval } from "@shared/types";
import { Engine } from "@/lib/engine/stockfish";

/** Time the engine gets on each position: a game of 80 moves takes about half a minute on a phone. */
const MS_PER_POSITION = 300;

/**
 * The full-strength engine's evaluation of every position of a game, the
 * initial one included, from White's side. A position where the game is over
 * needs no search: a checkmate is stored as `MAX_CP` against the side mated,
 * any draw as 0. Stops, and throws, once `signal` is aborted.
 */
export async function analyseGame(moves: string[], onProgress: (done: number, total: number) => void, signal: AbortSignal): Promise<PositionEval[]> {
  const total = moves.length + 1;
  const engine = new Engine();
  const out: PositionEval[] = [];
  try {
    await engine.start(null);
    for (let ply = 0; ply < total; ply++) {
      if (signal.aborted) throw new DOMException("analysis cancelled", "AbortError");
      const chess = replay(moves.slice(0, ply));
      if (!chess) throw new Error("illegal move in the game");
      const whiteToMove = chess.turn() === "w";
      if (chess.isCheckmate()) {
        out.push({ cp: whiteToMove ? -MAX_CP : MAX_CP, best: null });
      } else if (chess.isGameOver()) {
        out.push({ cp: 0, best: null });
      } else {
        const { score, best, pv: line } = await engine.evaluate(moves.slice(0, ply), MS_PER_POSITION);
        const side = whiteToMove ? 1 : -1;
        const pv = line.slice(0, MAX_PV).filter((m) => UCI.test(m));
        const entry: PositionEval =
          "mate" in score && score.mate !== 0
            ? { mate: side * Math.max(-MAX_MATE, Math.min(MAX_MATE, score.mate)), best, pv }
            : { cp: side * Math.max(-(MAX_CP - 1), Math.min(MAX_CP - 1, "cp" in score ? score.cp : 0)), best, pv };
        out.push(entry);
      }
      onProgress(ply + 1, total);
    }
    return out;
  } finally {
    engine.dispose();
  }
}
