import type { Judgement } from "@shared/analysis";

/** The words Lichess uses in Portuguese for each judgement. */
export const JUDGEMENT_WORD: Record<Judgement, string> = {
  inaccuracy: "Imprecisão",
  mistake: "Erro",
  blunder: "Erro grave",
};

/** Lichess's colours for the three, which read in both themes. */
export const JUDGEMENT_COLOR: Record<Judgement, string> = {
  inaccuracy: "text-[#56b4e9]",
  mistake: "text-[#e69f00]",
  blunder: "text-[#df5353]",
};
