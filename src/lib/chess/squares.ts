export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type File = (typeof FILES)[number];
export type Rank = (typeof RANKS)[number];
export type Square = `${File}${Rank}`;

export const ALL_SQUARES: Square[] = FILES.flatMap((f) =>
  RANKS.map((r) => `${f}${r}` as Square),
);

export const EMPTY_FEN = "8/8/8/8/8/8/8/8 w - - 0 1";
export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function fileOf(sq: Square): File {
  return sq[0] as File;
}

export function rankOf(sq: Square): Rank {
  return Number(sq[1]) as Rank;
}

export function fileIndex(sq: Square): number {
  return FILES.indexOf(fileOf(sq));
}

export function toSquare(fileIdx: number, rank: number): Square | null {
  if (fileIdx < 0 || fileIdx > 7 || rank < 1 || rank > 8) return null;
  return `${FILES[fileIdx]}${rank}` as Square;
}

/** a1 is dark, h1 is light. With a=1, b=2..., an odd sum of file + rank is light. */
export function isLight(sq: Square): boolean {
  return (fileIndex(sq) + 1 + rankOf(sq)) % 2 === 1;
}

export function squaresOfFile(f: File): Square[] {
  return RANKS.map((r) => `${f}${r}` as Square);
}

export function squaresOfRank(r: Rank): Square[] {
  return FILES.map((f) => `${f}${r}` as Square);
}

/** Walk from a square in a direction until the edge (inclusive of start). */
export function ray(from: Square, df: number, dr: number): Square[] {
  const out: Square[] = [from];
  let f = fileIndex(from) + df;
  let r = rankOf(from) + dr;
  let sq = toSquare(f, r);
  while (sq) {
    out.push(sq);
    f += df;
    r += dr;
    sq = toSquare(f, r);
  }
  return out;
}

/** Squares strictly between two squares on the same diagonal, plus ends. */
export function diagonalBetween(a: Square, b: Square): Square[] | null {
  const df = fileIndex(b) - fileIndex(a);
  const dr = rankOf(b) - rankOf(a);
  if (Math.abs(df) !== Math.abs(dr) || df === 0) return null;
  const sf = Math.sign(df);
  const sr = Math.sign(dr);
  const out: Square[] = [];
  for (let i = 0; i <= Math.abs(df); i++) {
    out.push(toSquare(fileIndex(a) + sf * i, rankOf(a) + sr * i)!);
  }
  return out;
}

export function sameDiagonal(a: Square, b: Square): boolean {
  if (a === b) return false;
  return Math.abs(fileIndex(a) - fileIndex(b)) === Math.abs(rankOf(a) - rankOf(b));
}

/** The full diagonal (edge to edge) that passes through both squares. */
export function fullDiagonal(a: Square, b: Square): Square[] | null {
  if (!sameDiagonal(a, b)) return null;
  const df = Math.sign(fileIndex(b) - fileIndex(a));
  const dr = Math.sign(rankOf(b) - rankOf(a));
  const back = ray(a, -df, -dr).reverse();
  const fwd = ray(a, df, dr).slice(1);
  return [...back, ...fwd];
}
