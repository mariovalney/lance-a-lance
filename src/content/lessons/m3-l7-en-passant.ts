import type { LessonDef, Screen } from "@/content/types";
import { boardFor, flipColors, isLegalPosition, placementToFen } from "@/content/lib/positions";
import { legalMoves, uciOf } from "@/lib/chess/game";
import { ALL_SQUARES, FILES, type Square } from "@/lib/chess/squares";
import { pick, randInt, shuffle } from "@/lib/random";

interface EpSetup {
  fen: string;
  lastMove: [Square, Square];
  capturer: Square;
  victim: Square;
  epSquare: Square;
}

function flipSq(sq: Square): Square {
  return `${sq[0]}${9 - Number(sq[1])}` as Square;
}

/** A white pawn on the 5th rank; a black pawn just jumped two squares next to it. */
function makeSetup(withEp: boolean): EpSetup | null {
  for (let guard = 0; guard < 200; guard++) {
    const fi = randInt(1, 6);
    const side = pick([-1, 1]);
    const capturer = `${FILES[fi]}5` as Square;
    const victim = `${FILES[fi + side]}5` as Square;
    const epSquare = `${FILES[fi + side]}6` as Square;
    const pieces: Partial<Record<Square, string>> = { [capturer]: "P", [victim]: "p", [`${FILES[(fi + 4) % 8]}2`]: "P" };
    const empty = ALL_SQUARES.filter((s) => !pieces[s] && s !== epSquare && s !== `${victim[0]}7`);
    const wk = pick(empty.filter((s) => Number(s[1]) <= 3));
    const bk = pick(empty.filter((s) => Number(s[1]) >= 7 && s !== wk));
    pieces[wk] = "K";
    pieces[bk] = "k";
    let lastMove: [Square, Square] = [`${victim[0]}7` as Square, victim];
    if (!withEp) {
      // The jump happened earlier; the last move was the black king.
      const from = ALL_SQUARES.find(
        (s) => !pieces[s] && s !== epSquare && Math.max(Math.abs(s.charCodeAt(0) - bk.charCodeAt(0)), Math.abs(Number(s[1]) - Number(bk[1]))) === 1,
      );
      if (!from) continue;
      lastMove = [from as Square, bk];
    }
    const fen = placementToFen(pieces, `w - ${withEp ? epSquare : "-"} 0 1`);
    if (!isLegalPosition(fen)) continue;
    const hasEp = legalMoves(fen).some((m) => m.flags.includes("e"));
    if (hasEp !== withEp) continue;
    return { fen, lastMove, capturer, victim, epSquare };
  }
  return null;
}

function maybeFlip(s: EpSetup): EpSetup {
  if (Math.random() < 0.6) return s;
  return {
    fen: flipColors(s.fen),
    lastMove: [flipSq(s.lastMove[0]), flipSq(s.lastMove[1])],
    capturer: flipSq(s.capturer),
    victim: flipSq(s.victim),
    epSquare: flipSq(s.epSquare),
  };
}

function captureRounds(n: number): Screen[] {
  const out: Screen[] = [];
  while (out.length < n) {
    const raw = makeSetup(true);
    if (!raw) continue;
    const s = maybeFlip(raw);
    const ep = legalMoves(s.fen).find((m) => m.flags.includes("e"))!;
    out.push({
      kind: "move",
      key: `en-passant:${s.fen}`,
      prompt: "O peão adversário acabou de avançar duas casas. Capture-o **en passant**.",
      board: boardFor(s.fen, { lastMove: s.lastMove, marks: { [s.victim]: "focus" } }),
      accept: (m) => m.flags.includes("e"),
      solution: uciOf(ep),
      wrong: () => `Não foi en passant. Leve o peão de \`${s.capturer}\` para \`${s.epSquare}\`: a casa por onde o peão adversário passou.`,
      illegal: `Para capturar en passant, o peão vai na diagonal para \`${s.epSquare}\`, a casa vazia atrás do peão adversário.`,
      success: "O peão adversário saiu do tabuleiro mesmo sem você cair na casa dele.",
      mistakeNote: "Captura en passant",
    });
  }
  return out;
}

function stillRounds(): Screen[] {
  return shuffle([true, false]).map((withEp) => {
    let raw = makeSetup(withEp);
    while (!raw) raw = makeSetup(withEp);
    const s = maybeFlip(raw);
    const side = s.fen.split(" ")[1] === "w" ? "brancas" : "pretas";
    return {
      kind: "choice",
      key: `ainda-da:${withEp}:${s.fen}`,
      prompt: `As ${side} jogam. O último lance está marcado. Dá para capturar en passant agora?`,
      board: boardFor(s.fen, { lastMove: s.lastMove }),
      options: [
        { id: "sim", label: "Dá" },
        { id: "nao", label: "Não dá" },
      ],
      correct: withEp ? "sim" : "nao",
      explain: withEp
        ? `Dá: o peão de \`${s.victim}\` acabou de avançar duas casas e parou ao lado do seu. Capture indo para \`${s.epSquare}\`.`
        : "Não dá: o avanço duplo foi antes. O último lance foi do rei, então a chance passou.",
      mistakeNote: "Quando vale o en passant",
    } satisfies Screen;
  });
}

export const lessonEnPassant: LessonDef = {
  id: "m3-l7",
  title: "En passant",
  summary: "A captura especial do peão que avançou duas casas.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "En passant",
      text: "Se um peão adversário avança **duas casas** e para bem ao lado do seu, você pode capturá-lo como se ele tivesse andado só uma. Isso se chama **en passant** (\"de passagem\").",
      board: {
        fen: "8/8/8/3pP3/8/8/8/8 w - d6 0 1",
        lastMove: ["d7", "d5"],
        arrows: [{ from: "e5", to: "d6", tone: "good" }],
        marks: { d5: "focus" },
      },
      tip: "Só vale no lance logo em seguida. Se você jogar outra coisa, perde a chance.",
    },
    ...captureRounds(2),
    ...stillRounds(),
  ],
};
