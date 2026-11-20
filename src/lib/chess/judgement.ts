import type { Judgement } from "@shared/analysis";

/** The words Lichess uses in Portuguese for each judgement, and ours for the good moves. */
export const JUDGEMENT_WORD: Record<Judgement, string> = {
  inaccuracy: "Imprecisão",
  mistake: "Erro",
  blunder: "Erro grave",
  only: "Lance único",
  brilliant: "Brilhante",
};

/** Lichess's colours, which read in both themes: its analysis colours, and its study colours for a good and a brilliant move. */
export const JUDGEMENT_COLOR: Record<Judgement, string> = {
  inaccuracy: "text-[#56b4e9]",
  mistake: "text-[#e69f00]",
  blunder: "text-[#df5353]",
  only: "text-[#22ac38]",
  brilliant: "text-[#168226]",
};
