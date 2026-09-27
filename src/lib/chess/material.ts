import type { Color } from "@/lib/chess/game";

type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

/**
 * The usual values: peão 1, cavalo e bispo 3, torre 5, dama 9
 * (https://en.wikipedia.org/wiki/Chess_piece_relative_value). The king is not counted.
 */
export const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** "um cavalo", "a dama": how a sentence names a piece. */
export const PIECE_NAME: Record<PieceType, string> = {
  p: "um peão",
  n: "um cavalo",
  b: "um bispo",
  r: "uma torre",
  q: "a dama",
  k: "o rei",
};

/**
 * `color`'s material on the board minus the opponent's, in pawns: 0 at the
 * start, +3 a knight ahead. Counted off the board rather than from captures,
 * so a promotion counts too.
 */
export function materialFor(fen: string, color: Color): number {
  let balance = 0;
  for (const ch of fen.split(" ")[0]) {
    const type = ch.toLowerCase() as PieceType;
    if (!(type in PIECE_VALUE)) continue;
    const white = ch !== type;
    balance += (white === (color === "w") ? 1 : -1) * PIECE_VALUE[type];
  }
  return balance;
}
