import { UCI } from "./games.js";
import type { PositionEval } from "./types.js";

/**
 * Judging the moves of a game from the engine's evaluation of every position,
 * the way Lichess does it (lila, modules/tree/src/main/Advice.scala):
 * a move is an inaccuracy (?!), a mistake (?) or a blunder (??) by how much it
 * drops the mover's winning chances. Lichess marks no good moves (! or !!),
 * and neither does this.
 */

export type Judgement = "inaccuracy" | "mistake" | "blunder";

/** The symbol for each judgement, and its NAG in PGN. */
export const GLYPH: Record<Judgement, { symbol: string; nag: number }> = {
  inaccuracy: { symbol: "?!", nag: 6 },
  mistake: { symbol: "?", nag: 2 },
  blunder: { symbol: "??", nag: 4 },
};

/** Beyond this the evaluation is "winning" either way (Lichess caps it the same). */
const CP_CEILING = 1000;

/** Deeper than any real game: a mate in more moves than this is not believable. */
export const MAX_MATE = 500;
/**
 * An evaluation stored as centipawns stays inside this. A checkmated position
 * is stored as exactly this, against the side that is mated: the engine has
 * no move to search there.
 */
export const MAX_CP = 100_000;

/**
 * Winning chances in [-1, 1] from centipawns, the curve Lichess fitted to its
 * games (https://lichess.org/page/accuracy).
 */
export function winningChances(cp: number): number {
  const capped = Math.max(-CP_CEILING, Math.min(CP_CEILING, cp));
  return 2 / (1 + Math.exp(-0.00368208 * capped)) - 1;
}

/** An evaluation from `color`'s side, in centipawns; a mate counts as the ceiling. */
function povCp(e: PositionEval, color: "w" | "b"): number {
  const white = "mate" in e ? Math.sign(e.mate) * CP_CEILING : e.cp;
  return color === "w" ? white : -white;
}

/** Who has a mate on the board, from `color`'s side: 1 for `color`, -1 against, 0 for nobody. */
function povMate(e: PositionEval, color: "w" | "b"): number {
  if (!("mate" in e)) return 0;
  return Math.sign(e.mate) * (color === "w" ? 1 : -1);
}

const byChances = (drop: number): Judgement | null => (drop >= 0.3 ? "blunder" : drop >= 0.2 ? "mistake" : drop >= 0.1 ? "inaccuracy" : null);

/**
 * The judgement of a move by `mover`, from the evaluation before it and after
 * it (both from White's side). A mate that appears or goes away is judged by
 * the evaluation on the other side of it, with Lichess's cut-offs.
 */
export function judge(before: PositionEval, after: PositionEval, mover: "w" | "b"): Judgement | null {
  // Giving mate is never a mistake.
  if (!("mate" in after) && Math.abs(after.cp) >= MAX_CP) return null;
  const mateBefore = povMate(before, mover);
  const mateAfter = povMate(after, mover);
  // A mate against the mover appears where there was none.
  if (mateBefore === 0 && mateAfter < 0) {
    const was = povCp(before, mover);
    return was < -999 ? "inaccuracy" : was < -700 ? "mistake" : "blunder";
  }
  // The mover had a mate and let it go.
  if (mateBefore > 0 && mateAfter === 0) {
    const now = povCp(after, mover);
    return now > 999 ? "inaccuracy" : now > 700 ? "mistake" : "blunder";
  }
  // A mate kept, only delayed, is not judged.
  if (mateBefore > 0 && mateAfter > 0) return null;
  return byChances(winningChances(povCp(before, mover)) - winningChances(povCp(after, mover)));
}

/**
 * The judgement of every move of a game: entry `i` is for the move that led to
 * position `i + 1`. White moves first, so even entries are White's.
 */
export function judgements(analysis: PositionEval[]): (Judgement | null)[] {
  return analysis.slice(1).map((after, i) => judge(analysis[i], after, i % 2 === 0 ? "w" : "b"));
}

/** The longest line kept for a position: enough to see a piece fall, short enough to stay small. */
export const MAX_PV = 8;

/** A position's evaluation as the server accepts it. */
export function isPositionEval(v: unknown): v is PositionEval {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const e = v as Record<string, unknown>;
  const keys = Object.keys(e)
    .filter((k) => k !== "pv")
    .sort()
    .join(",");
  const bestOk = e.best === null || (typeof e.best === "string" && UCI.test(e.best));
  const pvOk =
    e.pv === undefined || (Array.isArray(e.pv) && e.pv.length <= MAX_PV && e.pv.every((m) => typeof m === "string" && UCI.test(m)));
  if (!bestOk || !pvOk) return false;
  if (keys === "best,cp") return Number.isInteger(e.cp) && Math.abs(e.cp as number) <= MAX_CP;
  if (keys === "best,mate") return Number.isInteger(e.mate) && e.mate !== 0 && Math.abs(e.mate as number) <= MAX_MATE;
  return false;
}
