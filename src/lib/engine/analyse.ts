import { UCI, replay } from "@shared/games";
import { MAX_CP, MAX_MATE, MAX_PV } from "@shared/analysis";
import type { PositionEval, Score } from "@shared/types";
import { Engine } from "@/lib/engine/stockfish";
import { uciOf } from "@/lib/chess/game";

/**
 * Time the engine gets on each position. The analysis runs after the game, so
 * it can take its time: a game of 40 moves takes under a minute.
 */
const MS_PER_POSITION = 600;

/**
 * The full-strength engine's evaluation of every position of a game, the
 * initial one included, from White's side. A position where the game is over
 * needs no search: a checkmate is stored as `MAX_CP` against the side mated,
 * any draw as 0. Where the move played was the engine's best, a second search
 * over every other move finds the best alternative (`alt`), which is what
 * tells an only move ("!") apart. `known` evaluates the first positions already (an analysis
 * stopped halfway, or a study's first positions from the game it began from),
 * so the search starts after them. `onProgress` gets every evaluation so far,
 * for the caller to save as it goes. Stops, and throws, once `signal` is
 * aborted.
 */
/** A score from the side to move, from White's side and inside the stored bounds. */
function fromWhite(score: Score, whiteToMove: boolean): Score {
  const side = whiteToMove ? 1 : -1;
  return "mate" in score && score.mate !== 0
    ? { mate: side * Math.max(-MAX_MATE, Math.min(MAX_MATE, score.mate)) }
    : { cp: side * Math.max(-(MAX_CP - 1), Math.min(MAX_CP - 1, "cp" in score ? score.cp : 0)) };
}

export async function analyseGame(
  moves: string[],
  onProgress: (done: number, total: number, sofar: PositionEval[]) => void,
  signal: AbortSignal,
  known: PositionEval[] = [],
): Promise<PositionEval[]> {
  const total = moves.length + 1;
  const engine = new Engine();
  const out: PositionEval[] = known.slice(0, total);
  try {
    await engine.start(null);
    for (let ply = out.length; ply < total; ply++) {
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
        const pv = line.slice(0, MAX_PV).filter((m) => UCI.test(m));
        const entry: PositionEval = { ...fromWhite(score, whiteToMove), best, pv };
        if (ply < moves.length && moves[ply] === best) {
          const others = chess.moves({ verbose: true }).map(uciOf).filter((m) => m !== best);
          if (signal.aborted) throw new DOMException("analysis cancelled", "AbortError");
          const alt = others.length ? await engine.evaluate(moves.slice(0, ply), MS_PER_POSITION, others) : null;
          entry.alt = alt ? { ...fromWhite(alt.score, whiteToMove), best: alt.best } : null;
        }
        out.push(entry);
      }
      onProgress(ply + 1, total, [...out]);
    }
    return out;
  } finally {
    engine.dispose();
  }
}
