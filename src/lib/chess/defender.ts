import type { Move } from "chess.js";
import { legalMoves, play, withTurn } from "@/lib/chess/game";
import { FILES, type Square } from "@/lib/chess/squares";

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function centerDistance(sq: string): number {
  const f = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const r = Number(sq[1]) - 1;
  return Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));
}

/**
 * A stubborn defender for "mate the lone king" exercises:
 * grabs loose pieces, avoids mate in one, runs to the center and keeps room.
 */
export function defenderMove(fen: string): Move | null {
  const moves = legalMoves(fen);
  if (!moves.length) return null;
  const us = moves[0].color;
  const them = us === "w" ? "b" : "w";
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    const after = play(fen, { from: m.from as Square, to: m.to as Square, promotion: m.promotion });
    if (!after) continue;
    let score = 0;
    if (m.captured && !after.game.isAttacked(m.to as Square, them)) score += 1000 + VALUE[m.captured] * 10;
    // Does the attacker have mate in one after this?
    const replies = legalMoves(after.fen);
    const allowsMate = replies.some((r) => play(after.fen, { from: r.from as Square, to: r.to as Square, promotion: r.promotion })?.game.isCheckmate());
    if (allowsMate) score -= 500;
    const mobility = legalMoves(withTurn(after.fen, us)).length;
    score += mobility * 10;
    if (m.piece === "k") score -= centerDistance(m.to) * 6;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}
