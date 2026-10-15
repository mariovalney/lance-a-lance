import type { Move } from "chess.js";
import { readMove } from "@shared/notation";

/** "`Nf3` (cavalo para f3)" in RichText markup. */
export function moveLabel(m: Pick<Move, "san" | "piece" | "to" | "flags" | "promotion" | "captured">): string {
  return `\`${m.san}\` (${readMove(m)})`;
}

export const DEFAULT_ILLEGAL = "Esse lance não é permitido. Toque na peça para ver as casas possíveis.";
