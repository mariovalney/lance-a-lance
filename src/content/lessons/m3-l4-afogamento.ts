import type { LessonDef, Screen } from "@/content/types";
import { boardFor, mateMoves, randomVariant, stalemateMoves } from "@/content/lib/positions";
import { verdictRounds } from "@/content/lib/verdict";
import { uciOf } from "@/lib/chess/game";
import { shuffle } from "@/lib/random";

const POOL = [
  "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
  "k7/2Q5/1K6/8/8/8/8/8 b - - 0 1",
  "7k/7P/6K1/8/8/8/8/8 b - - 0 1",
  "k7/1R6/1K6/8/8/8/8/8 b - - 0 1",
  "4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1",
  "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1",
  "k7/2K5/8/8/8/8/8/R7 b - - 0 1",
  "7k/8/6K1/8/8/8/8/6Q1 b - - 0 1",
  "7k/8/6K1/5Q2/8/8/8/8 b - - 0 1",
];

/** Mate in one exists, and so does a stalemating trap. */
const TRAP_POOL = ["7k/8/6K1/8/8/8/8/5Q2 w - - 0 1", "k7/8/1K6/8/8/8/8/2Q5 w - - 0 1"];

function trapRounds(n: number): Screen[] {
  return shuffle(TRAP_POOL)
    .slice(0, n)
    .map((base) => {
      const fen = randomVariant(base, (f) => mateMoves(f).length > 0 && stalemateMoves(f).length > 0);
      const traps = stalemateMoves(fen).map((m) => m.san);
      return {
        kind: "move",
        key: `sem-afogar:${fen}`,
        prompt: "Dê xeque-mate em um lance. Cuidado para não afogar o rei.",
        board: boardFor(fen),
        accept: (_m, after) => after.isCheckmate(),
        solution: uciOf(mateMoves(fen)[0]),
        wrong: (m) =>
          traps.includes(m.san)
            ? `Afogou! Depois de \`${m.san}\` o rei não está em xeque e não tem lances: seria empate.`
            : `\`${m.san}\` não é mate: o rei ainda escapa.`,
        success: "Mate, sem cair no afogamento.",
        mistakeNote: "Mate sem afogar",
      } satisfies Screen;
    });
}

export const lessonAfogamento: LessonDef = {
  id: "m3-l4",
  title: "Afogamento (empate)",
  summary: "Quando quem joga não tem lances e não está em xeque: empate.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Afogamento",
      text: "**Afogamento**: quem joga não está em xeque, mas não tem nenhum lance permitido. A partida acaba **empatada**, mesmo com muita vantagem.",
      steps: ["A dama vai para `f7`. Agora é a vez das pretas, e o rei não está em xeque.", "Só que `g8`, `g7` e `h7` estão atacadas: ele não tem lance. Empate."],
      board: { fen: "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1" },
      demo: [
        { moves: ["f1f7"], marks: { h8: "focus" } },
        { marks: { h8: "focus", g8: "bad", g7: "bad", h7: "bad" } },
      ],
      tip: "É a maior armadilha de quem está ganhando: sempre deixe uma saída ou dê o mate.",
    },
    ...verdictRounds(POOL, 4, ["mate", "stalemate", "continues"], "afogado"),
    {
      kind: "explain",
      title: "Ganhar sem afogar",
      text: "Com muita vantagem, confira antes de jogar: o rei adversário ainda vai ter algum lance?",
      steps: [
        "`Qc7` parece forte.",
        "Mas, depois dele, o rei em `a8` não tem lance nenhum e não está em xeque: afogado.",
        "Com `Qc8` é xeque, e o rei não foge: mate.",
      ],
      board: { fen: "k7/8/1K6/8/8/8/8/2Q5 w - - 0 1" },
      demo: [
        { arrows: [{ from: "c1", to: "c7", tone: "hint" }] },
        { moves: ["c1c7"], marks: { a8: "bad" } },
        { fen: "k7/8/1K6/8/8/8/8/2Q5 w - - 0 1", moves: ["c1c8"], marks: { a8: "bad" } },
      ],
    },
    ...trapRounds(2),
  ],
};
