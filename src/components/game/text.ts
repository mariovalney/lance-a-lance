import type { GameEndReason, GameOutcome } from "@/lib/progress/types";

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
