import type { LessonDef, Screen } from "@/content/types";
import { toFen, type PieceChar } from "@/lib/chess/fen";
import { legalMoves, solvePath, uciOf } from "@/lib/chess/game";
import { FILES, toSquare, type Square } from "@/lib/chess/squares";
import { pick, randInt, shuffle } from "@/lib/random";

type Pieces = Partial<Record<Square, PieceChar>>;
const fenOf = (pieces: Pieces) => toFen(pieces, "w - - 0 1");
const ILLEGAL = "O peão só anda para frente: uma casa, ou duas no primeiro lance. Para capturar, ele vai na diagonal.";

function doubleStepRounds(n: number): Screen[] {
  const out: Screen[] = [];
  const files = shuffle([1, 2, 3, 4, 5, 6]);
  for (let i = 0; i < n; i++) {
    const f = files[i];
    const other = files[i + 3];
    const pieces: Pieces = { [`${FILES[f]}2`]: "P", [`${FILES[other]}${randInt(3, 5)}`]: "P" } as Pieces;
    const fen = fenOf(pieces);
    const double = legalMoves(fen).find((m) => m.flags.includes("b"))!;
    out.push({
      kind: "move",
      key: `peao-duas:${FILES[f]}`,
      prompt: "Avance duas casas com o peão que ainda não se mexeu.",
      board: { fen },
      accept: (m) => m.flags.includes("b"),
      solution: uciOf(double),
      wrong: (m) =>
        m.from === double.from
          ? "Esse peão podia ir mais longe: no primeiro lance ele anda uma ou duas casas."
          : `O peão de \`${m.from}\` já saiu da casa inicial, então só anda uma casa por vez.`,
      illegal: ILLEGAL,
      success: "No primeiro lance, cada peão pode escolher andar uma ou duas casas.",
      mistakeNote: "Primeiro lance do peão",
    });
  }
  return out;
}

function captureRounds(n: number): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const f = randInt(1, 6);
    const r = randInt(3, 5);
    const pawn = toSquare(f, r)!;
    const side = pick([-1, 1]);
    const target = toSquare(f + side, r + 1)!;
    const pieces: Pieces = {
      [pawn]: "P",
      [toSquare(f, r + 1)!]: "p", // blocks the way forward
      [target]: pick(["n", "b", "p"] as PieceChar[]),
      [toSquare(f - side, r - 1)!]: "p", // behind: not capturable
    };
    // A second white pawn with a normal move, so capturing is a real choice.
    const extraFile = f <= 3 ? 7 : 0;
    pieces[toSquare(extraFile, 3)!] = "P";
    const fen = fenOf(pieces);
    const captures = legalMoves(fen).filter((m) => m.captured);
    if (captures.length !== 1) continue;
    out.push({
      kind: "move",
      key: `peao-captura:${pawn}:${target}`,
      prompt: "Capture uma peça preta com um peão.",
      board: { fen },
      accept: (m) => Boolean(m.captured),
      solution: uciOf(captures[0]),
      wrong: (m) => `O peão foi para \`${m.to}\` sem capturar. O peão captura só na diagonal, para frente.`,
      illegal: "O peão não captura para frente nem para trás: só na diagonal, uma casa para frente.",
      success: "O peão anda reto, mas captura na diagonal.",
      mistakeNote: "Captura com o peão",
    });
  }
  return out;
}

/** A forward walk with captures on the way; the solver confirms the best count. */
function pathRounds(n: number): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 300) {
    let f = randInt(1, 6);
    let r = 2;
    const pieces: Pieces = { [toSquare(f, r)!]: "P" };
    const targets: Square[] = [];
    const steps = randInt(4, 5);
    let captures = 0;
    for (let i = 0; i < steps && r < 7; i++) {
      const canCapture = [-1, 1].filter((d) => f + d >= 0 && f + d <= 7);
      const doCapture = captures < 2 && (Math.random() < 0.55 || i >= steps - 2);
      if (doCapture && canCapture.length) {
        const d = pick(canCapture);
        f += d;
        r += 1;
        const sq = toSquare(f, r)!;
        pieces[sq] = "p";
        targets.push(sq);
        captures++;
      } else if (i === 0 && Math.random() < 0.5) {
        r += 2;
      } else {
        r += 1;
      }
    }
    const last = toSquare(f, r)!;
    if (!targets.includes(last)) targets.push(last);
    if (captures < 1) continue;
    const start = Object.entries(pieces).find(([, v]) => v === "P")![0] as Square;
    const fen = fenOf(pieces);
    const sol = solvePath(fen, start, targets, 8);
    if (!sol) continue;
    out.push({
      kind: "path",
      key: `peao-caminho:${start}:${targets.join(",")}`,
      prompt: "Leve o peão até a estrela capturando as peças pretas marcadas no caminho.",
      board: { fen },
      targets,
      par: sol.length,
      illegal: ILLEGAL,
      success: "Andar reto e capturar na diagonal: esse é o peão.",
      mistakeNote: "Caminho com o peão",
    });
  }
  return out;
}

export const lessonPeao: LessonDef = {
  id: "m2-l6",
  title: "Peão",
  summary: "O peão anda para frente, uma casa (ou duas no primeiro lance), e captura na diagonal.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Como o peão anda",
      text: "O **peão** anda uma casa para frente. No primeiro lance, ele pode escolher andar uma ou duas.",
      board: {
        fen: fenOf({ c2: "P", e2: "P", g3: "P" }),
        arrows: [
          { from: "e2", to: "e4" },
          { from: "c2", to: "c3" },
          { from: "g3", to: "g4" },
        ],
      },
    },
    ...doubleStepRounds(2),
    {
      kind: "explain",
      title: "Captura na diagonal",
      text: "Para capturar, o peão vai uma casa na diagonal, para frente. Uma peça bem na frente dele bloqueia o caminho.",
      board: {
        fen: fenOf({ e4: "P", e5: "p", d5: "n" }),
        marks: { d5: "focus", e5: "bad" },
        arrows: [{ from: "e4", to: "d5", tone: "good" }],
      },
    },
    ...captureRounds(2),
    {
      kind: "explain",
      title: "O peão nunca volta",
      text: "O peão é a única peça que não anda para trás. Se chegar na última fileira, vira outra peça: é a **promoção**, que você vai ver no Módulo 3.",
      board: { fen: fenOf({ e6: "P" }), arrows: [{ from: "e6", to: "e8", tone: "hint" }], marks: { e8: "ring" } },
    },
    ...pathRounds(2),
  ],
};
