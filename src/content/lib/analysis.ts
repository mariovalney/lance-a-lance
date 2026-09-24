import type { Color } from "@/lib/chess/game";
import { load } from "@/lib/chess/game";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";

export const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const NAME: Record<string, string> = { p: "peão", n: "cavalo", b: "bispo", r: "torre", q: "dama", k: "rei" };
export const ARTICLE: Record<string, string> = { p: "o", n: "o", b: "o", r: "a", q: "a", k: "o" };

export function other(c: Color): Color {
  return c === "w" ? "b" : "w";
}

export interface PieceOn {
  sq: Square;
  type: string;
  color: Color;
}

export function piecesOf(fen: string, color?: Color): PieceOn[] {
  const g = load(fen);
  const out: PieceOn[] = [];
  for (const sq of ALL_SQUARES) {
    const p = g.get(sq);
    if (p && (!color || p.color === color)) out.push({ sq, type: p.type, color: p.color });
  }
  return out;
}

/** Defended = attacked by its own side. */
export function isDefended(fen: string, sq: Square, color: Color): boolean {
  return load(fen).isAttacked(sq, color);
}

/** Pieces (not the king) that the opponent can win: attacked and undefended, or attacked by something cheaper. */
export function hangingPieces(fen: string, color: Color): PieceOn[] {
  const g = load(fen);
  const them = other(color);
  return piecesOf(fen, color).filter((p) => {
    if (p.type === "k") return false;
    const attackers = g.attackers(p.sq, them);
    if (!attackers.length) return false;
    const cheapest = Math.min(...attackers.map((a) => VALUE[g.get(a)!.type]));
    return !g.isAttacked(p.sq, color) || cheapest < VALUE[p.type];
  });
}

/** Pieces with no defender at all (whether attacked or not). */
export function loosePieces(fen: string, color: Color): PieceOn[] {
  const g = load(fen);
  return piecesOf(fen, color).filter((p) => p.type !== "k" && !g.isAttacked(p.sq, color));
}
