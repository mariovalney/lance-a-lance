import type { LessonDef, Screen } from "@/content/types";
import { boardFor, randomVariant, withRandomKings } from "@/content/lib/positions";
import { PIECE_NAME } from "@/lib/chess/notation";
import { legalMoves, uciOf } from "@/lib/chess/game";
import { FILES, type Square } from "@/lib/chess/squares";
import { pick, randInt } from "@/lib/random";

function queenRounds(n: number): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 100) {
    const f = FILES[randInt(0, 7)];
    const pieces: Partial<Record<Square, string>> = { [`${f}7`]: "P" };
    const fen0 = withRandomKings(pieces, "w", (fen) => {
      const moves = legalMoves(fen);
      return moves.some((m) => m.promotion === "q") && moves.some((m) => !m.promotion) && !fen.split(" ")[0].split("/")[0].includes("k");
    });
    if (!fen0) continue;
    const fen = randomVariant(fen0, undefined, { flip: true });
    const promo = legalMoves(fen).find((m) => m.promotion === "q")!;
    out.push({
      kind: "move",
      key: `promover:${fen}`,
      prompt: "Leve o peão até a última fileira e promova a **dama**.",
      board: boardFor(fen),
      accept: (m) => m.promotion === "q",
      solution: uciOf(promo),
      wrong: (m) =>
        m.promotion
          ? `Você escolheu ${PIECE_NAME[m.promotion]}. Aqui a dama é a escolha mais forte.`
          : "Esse lance não promove o peão. Avance o peão para a última fileira.",
      success: "Um peão virou a peça mais forte do jogo.",
      mistakeNote: "Promover a dama",
    });
  }
  return out;
}

function captureRounds(): Screen[] {
  for (let guard = 0; guard < 100; guard++) {
    const fi = randInt(1, 6);
    const f = FILES[fi];
    const side = pick([-1, 1]);
    const target = `${FILES[fi + side]}8` as Square;
    const pieces: Partial<Record<Square, string>> = {
      [`${f}7`]: "P",
      [`${f}8`]: "n",
      [target]: pick(["r", "b"]),
    };
    const fen0 = withRandomKings(pieces, "w", (fen) => {
      const moves = legalMoves(fen);
      return moves.some((m) => m.promotion && m.captured) && moves.some((m) => !m.promotion);
    });
    if (!fen0) continue;
    const fen = randomVariant(fen0, undefined, { flip: true });
    const promo = legalMoves(fen).find((m) => m.promotion === "q" && m.captured)!;
    return [
      {
        kind: "move",
        key: `promover-capturando:${fen}`,
        prompt: "O caminho está bloqueado. Promova o peão **capturando** na diagonal.",
        board: boardFor(fen),
        accept: (m) => Boolean(m.promotion && m.captured),
        solution: uciOf(promo),
        wrong: (m) => (m.promotion ? "Boa ideia promover, mas aqui é capturando." : "O peão pode chegar à última fileira capturando na diagonal."),
        illegal: "O peão não anda para frente quando há uma peça na frente dele. Ele captura na diagonal.",
        success: "Capturou e promoveu no mesmo lance.",
        mistakeNote: "Promover capturando",
      },
    ];
  }
  return [];
}

function knightRound(): Screen {
  const fen = randomVariant("8/2q1P1k1/8/8/8/8/8/K7 w - - 0 1", (f) => legalMoves(f).some((m) => m.promotion === "n"));
  const promo = legalMoves(fen).find((m) => m.promotion === "n")!;
  return {
    kind: "move",
    key: `promover-cavalo:${fen}`,
    prompt: "Promova o peão para a peça que ataca o **rei e a dama** adversários ao mesmo tempo.",
    board: boardFor(fen),
    accept: (m) => m.promotion === "n",
    solution: uciOf(promo),
    wrong: (m) =>
      m.promotion
        ? `A ${PIECE_NAME[m.promotion]} em \`${m.to}\` não ataca os dois. Pense na peça que anda em L.`
        : "Promova o peão: ele está a um passo da última fileira.",
    success: "Cavalo com xeque e ataque à dama: um garfo! No próximo lance ele captura a dama.",
    mistakeNote: "Promover a cavalo",
  };
}

export const lessonPromocao: LessonDef = {
  id: "m3-l6",
  title: "Promoção",
  summary: "O peão que chega ao fim do tabuleiro vira outra peça.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Promoção",
      text: "Quando o peão chega na última fileira, ele é **promovido**: vira dama, torre, bispo ou cavalo, à sua escolha. Quase sempre a escolha é a dama.",
      board: { fen: "8/4P3/8/8/8/8/8/8 w - - 0 1", arrows: [{ from: "e7", to: "e8" }], marks: { e8: "ring" } },
      tip: "Na notação, a promoção aparece assim: `e8=Q` (peão vira dama em e8).",
    },
    ...queenRounds(2),
    ...captureRounds(),
    {
      kind: "explain",
      title: "Às vezes, outra peça",
      text: "Em raros casos, promover a outra peça é melhor. O caso mais comum é o cavalo, que ataca de um jeito que a dama não consegue.",
      board: { fen: "8/2q1P1k1/8/8/8/8/8/K7 w - - 0 1", marks: { c7: "focus", g7: "focus" } },
    },
    knightRound(),
  ],
};
