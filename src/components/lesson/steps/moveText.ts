import type { Move } from "chess.js";
import { readMove } from "@/lib/chess/notation";

/** "`Nf3` (cavalo para f3)" in RichText markup. */
export function moveLabel(m: Pick<Move, "san" | "piece" | "to" | "flags" | "promotion" | "captured">): string {
  return `\`${m.san}\` (${readMove(m)})`;
}

export const DEFAULT_ILLEGAL = "Esse lance não é permitido. Toque na peça para ver as casas possíveis.";
export const MOVE_HELP = "Toque na peça e depois na casa de destino, ou arraste.";
