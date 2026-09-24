import type { LessonDef, Screen } from "@/content/types";
import { boardFor, mateMoves, randomVariant } from "@/content/lib/positions";
import { verdictRounds } from "@/content/lib/verdict";
import { uciOf } from "@/lib/chess/game";
import { shuffle } from "@/lib/random";

/** Side to move is the defender. Mix of mate, check with escape and no check. */
const VERDICT_POOL = [
  "4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1",
  "4R1k1/5p1p/8/8/8/8/8/6K1 b - - 0 1",
  "7k/6Q1/6K1/8/8/8/8/8 b - - 0 1",
  "7k/6Q1/8/8/8/8/8/6K1 b - - 0 1",
  "7k/8/6K1/8/8/8/8/6Q1 b - - 0 1",
  "k7/2K5/8/8/8/8/8/R7 b - - 0 1",
  "6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1",
  "k7/8/1K6/8/8/8/8/R7 b - - 0 1",
];

/** Side to move has at least one mate in one. */
export const MATE_IN_ONE_POOL: { fen: string; transform?: boolean }[] = [
  { fen: "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1" },
  { fen: "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1" },
  { fen: "k7/8/1K6/8/8/8/8/7R w - - 0 1" },
  { fen: "6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1" },
  { fen: "6k1/5ppp/8/8/8/8/5PPP/3Q2K1 w - - 0 1" },
  { fen: "4k3/8/4K3/8/8/8/8/Q7 w - - 0 1" },
  { fen: "6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1" },
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4", transform: false },
];

export function mateInOneRounds(n: number, keyPrefix = "mate-em-1"): Screen[] {
  return shuffle(MATE_IN_ONE_POOL)
    .slice(0, n)
    .map((item) => {
      const fen = item.transform === false ? item.fen : randomVariant(item.fen, (f) => mateMoves(f).length > 0);
      const mate = mateMoves(fen)[0];
      return {
        kind: "sequence",
        key: `${keyPrefix}:${fen}`,
        prompt: "Dê xeque-mate em um lance.",
        board: boardFor(fen),
        line: [uciOf(mate)],
        anyMateAtEnd: true,
        wrong: (m) => `\`${m.san}\` não é mate: o rei ainda tem saída. Procure um lance que ataque o rei e feche todas as fugas.`,
        success: "Xeque-mate!",
        mistakeNote: "Mate em 1",
      } satisfies Screen;
    });
}

export const lessonXequeMate: LessonDef = {
  id: "m3-l3",
  title: "Xeque-mate",
  summary: "O xeque sem saída, que termina a partida.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Xeque-mate",
      text: "**Xeque-mate** é o xeque sem saída: o rei não foge, ninguém bloqueia e ninguém captura quem ataca. Quem dá o mate vence a partida.",
      board: { fen: "4R1k1/5ppp/8/8/8/8/8/6K1 b - - 0 1", marks: { g8: "bad", e8: "focus" }, arrows: [{ from: "e8", to: "g8" }] },
      tip: "Esse é o mate do corredor: os próprios peões prendem o rei.",
    },
    ...verdictRounds(VERDICT_POOL, 3, ["mate", "check", "notcheck"], "e-mate"),
    {
      kind: "explain",
      title: "Sua vez de dar mate",
      text: "Procure lances que atacam o rei. Depois confira: ele consegue fugir, bloquear ou capturar? Se não, é mate.",
      board: { fen: "7k/8/6K1/8/8/8/8/5Q2 w - - 0 1", marks: { h8: "focus" } },
    },
    ...mateInOneRounds(3),
  ],
};
