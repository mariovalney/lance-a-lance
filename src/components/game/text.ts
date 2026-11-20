import type { Move } from "chess.js";
import type { Game, GameEndReason, GameOutcome } from "@/lib/progress/types";
import { replay, startPly } from "@shared/games";

/** The words the game screen, the review and the history share. */

export const TITLE: Record<GameOutcome, string> = { win: "Vitória", draw: "Empate", loss: "Derrota" };

export const REASON: Record<GameEndReason, string> = {
  checkmate: "Xeque-mate.",
  stalemate: "Afogamento.",
  insufficient: "Material insuficiente.",
  repetition: "Mesma posição três vezes.",
  fifty: "Regra dos 50 lances.",
  resigned: "Você abandonou.",
};

/** The last of the first `ply` moves of a game, numbered as the move list numbers it: "16." for White, "15..." for Black. */
export function numberedMove(moves: string[], ply: number): { number: string; move: Move } | null {
  const move = replay(moves.slice(0, ply))?.history({ verbose: true }).at(-1);
  return move ? { number: `${Math.ceil(ply / 2)}${ply % 2 === 1 ? "." : "..."}`, move } : null;
}

/** Where a study game began: "16. e4". */
export function studyStartName(game: Game): string {
  const start = numberedMove(game.moves, startPly(game));
  return start ? `${start.number} ${start.move.san}` : "";
}
