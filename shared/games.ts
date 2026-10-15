import { Chess } from "chess.js";
import type { GameEndReason, GameOutcome } from "./types.js";

/** The computer's levels, by nominal rating. */
export const GAME_LEVELS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400] as const;

/**
 * How each level plays, the same in the browser and on the server. From 1400 up the strength is Stockfish's own
 * `UCI_Elo`, which accepts 1320 to 3190. Below that there is nothing to ask it
 * for, so the weak levels search shallow at `Skill Level 0` and, now and then,
 * play a random legal move instead. Their ratings are an estimate, not a
 * measurement.
 */
export interface BotLevel {
  rating: number;
  /** Chance of a random legal move instead of the engine's. */
  randomMove: number;
  /** Search depth for the weak levels. */
  depth?: number;
  /** UCI_Elo for the levels Stockfish limits itself. */
  elo?: number;
}

export const BOT_LEVELS: BotLevel[] = [
  { rating: 400, randomMove: 0.5, depth: 1 },
  { rating: 600, randomMove: 0.35, depth: 2 },
  { rating: 800, randomMove: 0.2, depth: 3 },
  { rating: 1000, randomMove: 0.1, depth: 4 },
  { rating: 1200, randomMove: 0.05, depth: 6 },
  { rating: 1400, randomMove: 0, elo: 1400 },
  { rating: 1600, randomMove: 0, elo: 1600 },
  { rating: 1800, randomMove: 0, elo: 1800 },
  { rating: 2000, randomMove: 0, elo: 2000 },
  { rating: 2200, randomMove: 0, elo: 2200 },
  { rating: 2400, randomMove: 0, elo: 2400 },
];

/** The level closest to a rating, the easier one on a tie. */
export function levelNear(rating: number): BotLevel {
  return BOT_LEVELS.reduce((best, l) => (Math.abs(l.rating - rating) < Math.abs(best.rating - rating) ? l : best));
}

export function levelByRating(rating: number): BotLevel | undefined {
  return BOT_LEVELS.find((l) => l.rating === rating);
}

/** Time the limited-strength levels think per move. */
export const BOT_MOVE_TIME_MS = 700;

export const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Far beyond any real game (the longest ones run to a few hundred moves). */
export const MAX_MOVES = 1200;

/**
 * Whether `moves` continues `saved` (or repeats it). The same game can be
 * played on two devices, or in the app and through the API, so a list that
 * does not start with every saved move comes from a stale copy.
 */
export const continues = (saved: string[], moves: string[]): boolean => moves.length >= saved.length && saved.every((m, i) => moves[i] === m);

/** The game after these UCI moves from the initial position, or null if one is illegal. */
export function replay(moves: string[]): Chess | null {
  const chess = new Chess();
  try {
    for (const m of moves) chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] || undefined });
  } catch {
    return null;
  }
  return chess;
}

/** How the rules end this position for `player`, or null while it goes on. */
export function endOf(chess: Chess, player: "w" | "b"): { outcome: GameOutcome; reason: GameEndReason } | null {
  if (chess.isCheckmate()) return { outcome: chess.turn() === player ? "loss" : "win", reason: "checkmate" };
  if (chess.isStalemate()) return { outcome: "draw", reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { outcome: "draw", reason: "insufficient" };
  if (chess.isThreefoldRepetition()) return { outcome: "draw", reason: "repetition" };
  if (chess.isDraw()) return { outcome: "draw", reason: "fifty" };
  return null;
}
