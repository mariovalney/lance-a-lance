import { FILES, type Square } from "@/lib/chess/squares";

export type PieceChar = "p" | "n" | "b" | "r" | "q" | "k" | "P" | "N" | "B" | "R" | "Q" | "K";

/** Reads the piece placement field of a FEN into a square map. */
export function parsePlacement(fen: string): Map<Square, PieceChar> {
  const out = new Map<Square, PieceChar>();
  const rows = fen.split(" ")[0].split("/");
  rows.forEach((row, i) => {
    const rank = 8 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        out.set(`${FILES[file]}${rank}` as Square, ch as PieceChar);
        file++;
      }
    }
  });
  return out;
}

/** Builds a FEN from a square map (side to move and extras are configurable). */
export function toFen(pieces: Map<Square, PieceChar> | Partial<Record<Square, PieceChar>>, rest = "w - - 0 1"): string {
  const get = (sq: Square) => (pieces instanceof Map ? pieces.get(sq) : pieces[sq]);
  const rows: string[] = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = "";
    let empty = 0;
    for (const f of FILES) {
      const p = get(`${f}${rank}` as Square);
      if (p) {
        if (empty) row += empty;
        empty = 0;
        row += p;
      } else {
        empty++;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${rest}`;
}

export const PIECE_NAME_PT: Record<string, string> = {
  p: "peão",
  n: "cavalo",
  b: "bispo",
  r: "torre",
  q: "dama",
  k: "rei",
};

export function pieceName(ch: PieceChar): string {
  return PIECE_NAME_PT[ch.toLowerCase()];
}

export function isWhitePiece(ch: PieceChar): boolean {
  return ch === ch.toUpperCase();
}

/** "cavalo branco", "dama preta" */
export function pieceWithColor(ch: PieceChar): string {
  const name = pieceName(ch);
  const feminine = name === "dama" || name === "torre";
  const color = isWhitePiece(ch) ? (feminine ? "branca" : "branco") : feminine ? "preta" : "preto";
  return `${name} ${color}`;
}
