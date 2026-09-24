import type { Screen } from "@/content/types";
import { randomVariant, verdictOf, type Verdict } from "@/content/lib/positions";
import { legalMoves } from "@/lib/chess/game";
import { readMove } from "@/lib/chess/notation";
import { shuffle } from "@/lib/random";

export type VerdictOption = "mate" | "check" | "notcheck" | "stalemate" | "continues";

const LABEL: Record<VerdictOption, string> = {
  mate: "Xeque-mate",
  check: "Xeque, mas tem saída",
  notcheck: "Não é xeque",
  stalemate: "Afogamento (empate)",
  continues: "O jogo continua",
};

function sideName(fen: string) {
  return fen.split(" ")[1] === "w" ? "brancas" : "pretas";
}

function answerFor(v: Verdict, options: VerdictOption[]): VerdictOption {
  if (v === "mate") return "mate";
  if (v === "stalemate") return "stalemate";
  if (v === "check") return options.includes("check") ? "check" : "continues";
  return options.includes("notcheck") ? "notcheck" : "continues";
}

function explainFor(fen: string, v: Verdict): string {
  const side = sideName(fen);
  const Side = side[0].toUpperCase() + side.slice(1);
  if (v === "mate") return "Xeque-mate: o rei está atacado e não tem fuga, bloqueio nem captura.";
  if (v === "stalemate") return `Afogamento: as ${side} não estão em xeque, mas não têm nenhum lance permitido. É empate.`;
  const m = legalMoves(fen)[0];
  const example = `\`${m.san}\` (${readMove(m)})`;
  if (v === "check") return `É xeque, mas tem saída: por exemplo ${example}.`;
  return `${Side} não estão em xeque e têm lances, como ${example}.`;
}

/** "What is this position?" for the side to move. Answer and explanation come from chess.js. */
export function verdictRounds(pool: string[], n: number, options: VerdictOption[], keyPrefix: string): Screen[] {
  return shuffle(pool)
    .slice(0, n)
    .map((base) => {
      const fen = randomVariant(base);
      const v = verdictOf(fen);
      const side = sideName(fen);
      const attacker = fen.split(" ")[1] === "w" ? "black" : "white";
      return {
        kind: "choice",
        key: `${keyPrefix}:${fen}`,
        prompt: `${side[0].toUpperCase() + side.slice(1)} jogam. O que está acontecendo?`,
        board: { fen, orientation: attacker },
        options: options.map((o) => ({ id: o, label: LABEL[o] })),
        correct: answerFor(v, options),
        explain: explainFor(fen, v),
        mistakeNote: `Reconhecer ${v === "mate" ? "xeque-mate" : v === "stalemate" ? "afogamento" : v === "check" ? "xeque com saída" : "posição sem xeque"}`,
      } satisfies Screen;
    });
}
