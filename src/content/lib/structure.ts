import type { Color } from "@/lib/chess/game";
import { legalMoves, withTurn } from "@/lib/chess/game";
import { parsePlacement, type PieceChar } from "@/lib/chess/fen";
import { FILES, fileIndex, rankOf, toSquare, type Square } from "@/lib/chess/squares";
import { pick, randInt } from "@/lib/random";

export function pawnsOf(fen: string, color: Color): Square[] {
  const target = color === "w" ? "P" : "p";
  return [...parsePlacement(fen).entries()].filter(([, p]) => p === target).map(([sq]) => sq);
}

function filesOf(pawns: Square[]): Set<number> {
  return new Set(pawns.map(fileIndex));
}

export function isolatedPawns(fen: string, color: Color): Square[] {
  const pawns = pawnsOf(fen, color);
  const files = filesOf(pawns);
  return pawns.filter((sq) => !files.has(fileIndex(sq) - 1) && !files.has(fileIndex(sq) + 1));
}

export function doubledPawns(fen: string, color: Color): Square[] {
  const pawns = pawnsOf(fen, color);
  return pawns.filter((sq) => pawns.some((o) => o !== sq && fileIndex(o) === fileIndex(sq)));
}

export function passedPawns(fen: string, color: Color): Square[] {
  const mine = pawnsOf(fen, color);
  const theirs = pawnsOf(fen, color === "w" ? "b" : "w");
  return mine.filter((sq) =>
    !theirs.some((t) => Math.abs(fileIndex(t) - fileIndex(sq)) <= 1 && (color === "w" ? rankOf(t) > rankOf(sq) : rankOf(t) < rankOf(sq))),
  );
}

export function pawnIslands(fen: string, color: Color): number {
  const files = filesOf(pawnsOf(fen, color));
  let islands = 0;
  for (let f = 0; f < 8; f++) if (files.has(f) && !files.has(f - 1)) islands++;
  return islands;
}

export function openFiles(fen: string): string[] {
  const all = filesOf([...pawnsOf(fen, "w"), ...pawnsOf(fen, "b")]);
  return FILES.filter((_, i) => !all.has(i));
}

/** Squares in the opponent's half, protected by own pawn, that no enemy pawn can ever attack. */
export function outposts(fen: string, color: Color): Square[] {
  const mine = pawnsOf(fen, color);
  const theirs = pawnsOf(fen, color === "w" ? "b" : "w");
  const board = parsePlacement(fen);
  const ranks = color === "w" ? [4, 5, 6] : [5, 4, 3];
  const out: Square[] = [];
  for (const r of ranks) {
    for (let f = 0; f < 8; f++) {
      const sq = toSquare(f, r)!;
      if (board.get(sq)?.toLowerCase() === "p") continue;
      const behind = color === "w" ? r - 1 : r + 1;
      const supported = [f - 1, f + 1].some((ff) => mine.includes(toSquare(ff, behind) as Square));
      if (!supported) continue;
      const attackable = theirs.some(
        (t) => Math.abs(fileIndex(t) - f) === 1 && (color === "w" ? rankOf(t) > r : rankOf(t) < r),
      );
      if (!attackable) out.push(sq);
    }
  }
  return out;
}

/** Number of moves the piece on `sq` has (as if its side were to move). */
export function mobility(fen: string, sq: Square, color: Color): number {
  return legalMoves(withTurn(fen, color), sq).length;
}

/** A plausible random pawn structure (white on ranks 2-5, black on 4-7). */
export function randomPawns(): Partial<Record<Square, PieceChar>> {
  const out: Partial<Record<Square, PieceChar>> = {};
  for (let f = 0; f < 8; f++) {
    const file = FILES[f];
    const roll = Math.random();
    if (roll < 0.72) out[`${file}${randInt(2, 4)}` as Square] = "P";
    if (roll > 0.9) {
      out[`${file}${2}` as Square] = "P";
      out[`${file}${randInt(3, 4)}` as Square] = "P";
    }
    const roll2 = Math.random();
    const br = pick([5, 6, 7]);
    const sq = `${file}${br}` as Square;
    if (roll2 < 0.72 && !out[sq]) out[sq] = "p";
    if (roll2 > 0.9) {
      const a = `${file}7` as Square;
      const b = `${file}${pick([5, 6])}` as Square;
      if (!out[a]) out[a] = "p";
      if (!out[b]) out[b] = "p";
    }
  }
  return out;
}
