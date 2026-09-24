import { Chess, type Move, type PieceSymbol } from "chess.js";
import type { Square } from "@/lib/chess/squares";

export type Color = "w" | "b";
export type { Move };

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
}

/** chess.js game that also accepts teaching positions (no kings, lone pieces). */
export function load(fen: string): Chess {
  return new Chess(fen, { skipValidation: true });
}

export function turnOf(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** Same position with another side to move (en passant cleared). */
export function withTurn(fen: string, color: Color): string {
  const parts = fen.split(" ");
  parts[1] = color;
  parts[3] = "-";
  return parts.join(" ");
}

export function legalMoves(fen: string, from?: Square): Move[] {
  const game = load(fen);
  return from ? game.moves({ square: from, verbose: true }) : game.moves({ verbose: true });
}

export function isPromotion(fen: string, from: Square, to: Square): boolean {
  return legalMoves(fen, from).some((m) => m.to === to && Boolean(m.promotion));
}

export interface PlayedMove {
  move: Move;
  fen: string;
  game: Chess;
}

/** Plays a move if legal; returns null otherwise. */
export function play(fen: string, input: MoveInput): PlayedMove | null {
  const game = load(fen);
  try {
    const move = game.move({ from: input.from, to: input.to, promotion: input.promotion ?? "q" });
    return { move, fen: game.fen(), game };
  } catch {
    return null;
  }
}

export function uciOf(m: Pick<Move, "from" | "to" | "promotion">): string {
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

export function parseUci(uci: string): MoveInput {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] as PieceSymbol | undefined) || undefined,
  };
}

export function pieceColorAt(fen: string, sq: Square): Color | null {
  const p = load(fen).get(sq);
  return p ? p.color : null;
}

/** Squares attacked by `by` (uses chess.js attackers). */
export function isAttacked(fen: string, sq: Square, by: Color): boolean {
  return load(fen).isAttacked(sq, by);
}

/** Plays a UCI line from a position, returning each resulting FEN. */
export function playLine(fen: string, line: string[]): { fens: string[]; moves: Move[] } | null {
  const game = load(fen);
  const fens: string[] = [];
  const moves: Move[] = [];
  for (const uci of line) {
    try {
      const m = game.move(parseUci(uci));
      moves.push(m);
      fens.push(game.fen());
    } catch {
      return null;
    }
  }
  return { fens, moves };
}

/* ---------- fast single-piece moves (for paths and generators) ---------- */

const KING_STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const KNIGHT_STEPS: [number, number][] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const ROOK_DIRS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const FILE_CHARS = "abcdefgh";

function sqAt(f: number, r: number): Square | null {
  return f >= 0 && f < 8 && r >= 1 && r <= 8 ? (`${FILE_CHARS[f]}${r}` as Square) : null;
}

/**
 * Destinations for one piece given an occupancy lookup (no check rules).
 * `occ` returns the piece char on a square, or undefined when empty.
 */
export function pieceDestinations(piece: string, from: Square, occ: (sq: Square) => string | undefined): Square[] {
  const white = piece === piece.toUpperCase();
  const own = (p: string | undefined) => p !== undefined && (p === p.toUpperCase()) === white;
  const f0 = FILE_CHARS.indexOf(from[0]);
  const r0 = Number(from[1]);
  const out: Square[] = [];
  const type = piece.toLowerCase();
  const slide = (dirs: [number, number][]) => {
    for (const [df, dr] of dirs) {
      for (let k = 1; k < 8; k++) {
        const s = sqAt(f0 + df * k, r0 + dr * k);
        if (!s) break;
        const p = occ(s);
        if (own(p)) break;
        out.push(s);
        if (p !== undefined) break;
      }
    }
  };
  if (type === "r") slide(ROOK_DIRS);
  else if (type === "b") slide(BISHOP_DIRS);
  else if (type === "q") slide([...ROOK_DIRS, ...BISHOP_DIRS]);
  else if (type === "k" || type === "n") {
    for (const [df, dr] of type === "k" ? KING_STEPS : KNIGHT_STEPS) {
      const s = sqAt(f0 + df, r0 + dr);
      if (s && !own(occ(s))) out.push(s);
    }
  } else if (type === "p") {
    const dir = white ? 1 : -1;
    const one = sqAt(f0, r0 + dir);
    if (one && occ(one) === undefined) {
      out.push(one);
      const startRank = white ? 2 : 7;
      const two = sqAt(f0, r0 + 2 * dir);
      if (r0 === startRank && two && occ(two) === undefined) out.push(two);
    }
    for (const df of [-1, 1]) {
      const s = sqAt(f0 + df, r0 + dir);
      const p = s ? occ(s) : undefined;
      if (s && p !== undefined && !own(p)) out.push(s);
    }
  }
  return out;
}

function placement(fen: string): Map<Square, string> {
  const map = new Map<Square, string>();
  fen
    .split(" ")[0]
    .split("/")
    .forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else map.set(`${FILE_CHARS[f++]}${8 - i}` as Square, ch);
      }
    });
  return map;
}

/** Shortest way for the piece on `from` to visit every target (the player keeps the move). */
export function solvePath(fen: string, from: Square, targets: Square[], maxDepth = 12): MoveInput[] | null {
  const board = placement(fen);
  const piece = board.get(from);
  if (!piece) return null;
  board.delete(from);
  const full = (1 << targets.length) - 1;
  type Node = { sq: Square; mask: number; path: MoveInput[] };
  const seen = new Set<string>([`${from}:0`]);
  let frontier: Node[] = [{ sq: from, mask: 0, path: [] }];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      const occ = (s: Square) => {
        const idx = targets.indexOf(s);
        if (idx >= 0 && node.mask & (1 << idx)) return undefined; // captured already
        return board.get(s);
      };
      for (const to of pieceDestinations(piece, node.sq, occ)) {
        const idx = targets.indexOf(to);
        const mask = idx >= 0 ? node.mask | (1 << idx) : node.mask;
        const path = [...node.path, { from: node.sq, to }];
        if (mask === full) return path;
        const key = `${to}:${mask}`;
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ sq: to, mask, path });
      }
    }
    frontier = next;
  }
  return null;
}
