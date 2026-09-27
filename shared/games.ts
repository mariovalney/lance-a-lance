import { Chess } from "chess.js";
import type { GameEndReason, GameOutcome } from "./types.js";

/** The computer's levels, by nominal rating. The app decides how each one plays. */
export const GAME_LEVELS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400] as const;

export const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

/** Far beyond any real game (the longest ones run to a few hundred moves). */
export const MAX_MOVES = 1200;

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
