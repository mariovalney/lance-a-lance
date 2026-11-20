import type { Move } from "chess.js";
import { UCI, replay } from "./games.js";
import type { PositionEval, Score } from "./types.js";

/**
 * Judging the moves of a game from the engine's evaluation of every position,
 * the way Lichess does it (lila, modules/tree/src/main/Advice.scala):
 * a move is an inaccuracy (?!), a mistake (?) or a blunder (??) by how much it
 * drops the mover's winning chances. Lichess marks no good moves; this marks
 * one on the same scale: the only move (!), the engine's best when every other
 * move would have been a mistake or worse.
 */

export type Judgement = "inaccuracy" | "mistake" | "blunder" | "only";

/** The symbol for each judgement, and its NAG in PGN (the standard's $1 is a good move). */
export const GLYPH: Record<Judgement, { symbol: string; nag: number }> = {
  inaccuracy: { symbol: "?!", nag: 6 },
  mistake: { symbol: "?", nag: 2 },
  blunder: { symbol: "??", nag: 4 },
  only: { symbol: "!", nag: 1 },
};

/** The judgements that praise a move rather than fault it. */
export const isGood = (j: Judgement | null): boolean => j === "only";

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
function povCp(e: Score, color: "w" | "b"): number {
  const white = "mate" in e ? Math.sign(e.mate) * CP_CEILING : e.cp;
  return color === "w" ? white : -white;
}

/** Winning chances from `color`'s side, a mate counting as the ceiling. */
export const chancesFor = (e: Score, color: "w" | "b"): number => winningChances(povCp(e, color));

/** Who has a mate on the board, from `color`'s side: 1 for `color`, -1 against, 0 for nobody. */
function povMate(e: Score, color: "w" | "b"): number {
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
 * The judgement of the move that led to position `ply` (1 is White's first
 * move). The engine's own best move is never judged: each position is searched
 * on its own, and in a sharp one two neighbouring searches can disagree by more
 * than a threshold even when the move played was the one the engine chose.
 */
export function judgeMove(analysis: PositionEval[], moves: string[], ply: number): Judgement | null {
  const before = analysis[ply - 1];
  const after = analysis[ply];
  if (!before || !after) return null;
  if (before.best !== null && before.best === moves[ply - 1]) return null;
  return judge(before, after, ply % 2 === 1 ? "w" : "b");
}

/** How much worse than the best move the best of the others is, in winning chances, for the side that played the move to `ply`. */
export function altDrop(analysis: PositionEval[], ply: number): number | null {
  const before = analysis[ply - 1];
  if (!before?.alt) return null;
  const mover = ply % 2 === 1 ? "w" : "b";
  return chancesFor(before, mover) - chancesFor(before.alt, mover);
}

/** Still clearly losing after the best move: finding it saves nothing. */
const LOST = -0.3;

/**
 * Whether the move that led to position `ply` was the only move: the engine's
 * best, with every other move a mistake or worse (`alt` drops the winning
 * chances by 0.2, Lichess's threshold for "?"). Never for a move that is
 * expected rather than found: a recapture, a capture right after the
 * opponent's mistake, a move that mates at once, or one that still loses.
 * `history` is the game's moves as chess.js plays them.
 */
export function isOnlyMove(analysis: PositionEval[], moves: string[], ply: number, history: Move[]): boolean {
  const before = analysis[ply - 1];
  const after = analysis[ply];
  const drop = altDrop(analysis, ply);
  if (!before || !after || before.best !== moves[ply - 1] || drop === null || drop < 0.2) return false;
  const mover = ply % 2 === 1 ? "w" : "b";
  if (chancesFor(before, mover) < LOST) return false;
  if (!("mate" in after) && Math.abs(after.cp) >= MAX_CP) return false;
  const move = history[ply - 1];
  const previous = history[ply - 2];
  if (move?.captured && previous?.captured && previous.to === move.to) return false;
  const answered = judgeMove(analysis, moves, ply - 1);
  if (move?.captured && (answered === "mistake" || answered === "blunder")) return false;
  return true;
}

/** The judgement of the move to `ply`, good or bad. */
export function markMove(analysis: PositionEval[], moves: string[], ply: number, history: Move[]): Judgement | null {
  return isOnlyMove(analysis, moves, ply, history) ? "only" : judgeMove(analysis, moves, ply);
}

/**
 * The judgement of every move of a game: entry `i` is for the move that led to
 * position `i + 1`. White moves first, so even entries are White's.
 */
export function judgements(analysis: PositionEval[], moves: string[]): (Judgement | null)[] {
  const history = replay(moves)?.history({ verbose: true }) ?? [];
  return analysis.slice(1).map((_, i) => markMove(analysis, moves, i + 1, history));
}

/**
 * An analysis saved before the best alternatives were searched: it has no
 * `alt` where the move played was the engine's best, so it cannot tell an only
 * move apart.
 */
export const lacksAlternatives = (analysis: PositionEval[], moves: string[]): boolean =>
  analysis.some((e, i) => i < moves.length && e.best === moves[i] && e.alt === undefined);

/** The longest line kept for a position: enough to see a piece fall, short enough to stay small. */
export const MAX_PV = 8;

/** A score with a move, `{ cp | mate, best }`, as an evaluation and its alternative store them. */
function isScored(e: Record<string, unknown>, extra: string[]): boolean {
  const keys = Object.keys(e)
    .filter((k) => !extra.includes(k))
    .sort()
    .join(",");
  if (keys === "best,cp") return Number.isInteger(e.cp) && Math.abs(e.cp as number) <= MAX_CP;
  if (keys === "best,mate") return Number.isInteger(e.mate) && e.mate !== 0 && Math.abs(e.mate as number) <= MAX_MATE;
  return false;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** A position's evaluation as the server accepts it. */
export function isPositionEval(v: unknown): v is PositionEval {
  if (!isObject(v)) return false;
  const e = v;
  const bestOk = e.best === null || (typeof e.best === "string" && UCI.test(e.best));
  const pvOk =
    e.pv === undefined || (Array.isArray(e.pv) && e.pv.length <= MAX_PV && e.pv.every((m) => typeof m === "string" && UCI.test(m)));
  const altOk = e.alt === undefined || e.alt === null || (isObject(e.alt) && typeof e.alt.best === "string" && UCI.test(e.alt.best) && isScored(e.alt, []));
  return bestOk && pvOk && altOk && isScored(e, ["pv", "alt"]);
}
