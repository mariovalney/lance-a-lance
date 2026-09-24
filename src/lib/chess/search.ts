import type { Chess, Move } from "chess.js";
import { load } from "@/lib/chess/game";

function orderChecksFirst(game: Chess): Move[] {
  const moves = game.moves({ verbose: true });
  return moves.sort((a, b) => Number(b.san.includes("+") || b.san.includes("#")) - Number(a.san.includes("+") || a.san.includes("#")));
}

/** Can the side to move force mate within `n` of its own moves? (small n only) */
export function forcedMate(fen: string, n: number): boolean {
  const game = load(fen);
  return attackerWins(game, n);
}

function attackerWins(game: Chess, n: number): boolean {
  if (n <= 0) return false;
  for (const m of orderChecksFirst(game)) {
    game.move(m);
    let ok: boolean;
    if (game.isCheckmate()) ok = true;
    else if (game.isDraw() || n === 1) ok = false;
    else ok = defenderLoses(game, n - 1);
    game.undo();
    if (ok) return true;
  }
  return false;
}

function defenderLoses(game: Chess, n: number): boolean {
  const replies = game.moves({ verbose: true });
  if (!replies.length) return false;
  for (const r of replies) {
    game.move(r);
    const lost = attackerWins(game, n);
    game.undo();
    if (!lost) return false;
  }
  return true;
}

/** First moves that force mate within `n` moves. */
export function mateInNMoves(fen: string, n: number): Move[] {
  const game = load(fen);
  const out: Move[] = [];
  for (const m of game.moves({ verbose: true })) {
    game.move(m);
    const ok = game.isCheckmate() || (n > 1 && !game.isDraw() && defenderLoses(game, n - 1));
    game.undo();
    if (ok) out.push(m);
  }
  return out;
}
