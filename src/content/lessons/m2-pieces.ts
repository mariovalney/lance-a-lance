import type { DemoFrame, ExplainScreen, LessonDef, MarkKind, Screen } from "@/content/types";
import { toFen, type PieceChar } from "@/lib/chess/fen";
import { legalMoves, pieceDestinations, solvePath, uciOf } from "@/lib/chess/game";
import { ALL_SQUARES, fileIndex, rankOf, toSquare, type Square } from "@/lib/chess/squares";
import { pick, pickDistinct, shuffle } from "@/lib/random";

/* ---------- helpers ---------- */

type Pieces = Partial<Record<Square, PieceChar>>;

const fenOf = (pieces: Pieces) => toFen(pieces, "w - - 0 1");

function marksFor(squares: Square[], kind: MarkKind): Partial<Record<Square, MarkKind>> {
  return Object.fromEntries(squares.map((s) => [s, kind]));
}

function reach(pieces: Pieces, from: Square): Square[] {
  return [...new Set(legalMoves(fenOf(pieces), from).map((m) => m.to as Square))];
}

/** Squares where a pawn may stand without looking odd (ranks 2 to 7). */
const PAWN_SQUARES = ALL_SQUARES.filter((s) => rankOf(s) >= 2 && rankOf(s) <= 7);

/**
 * One step of a demonstration: its text, the piece's moves (UCI), and whether
 * to draw the piece's reach (and, for the long-range pieces, its lines) once
 * they are played.
 */
interface PieceStep {
  text: string;
  moves?: string[];
  reach?: boolean;
  lines?: boolean;
}

interface PieceInfo {
  char: "R" | "B" | "Q" | "K" | "N";
  name: string;
  /** "a torre", "o bispo" */
  the: string;
  /** "A torre", "O bispo" */
  The: string;
  moveText: string;
  /** How it moves, played out from `showcase`, the reach counted in the text. */
  moveSteps: PieceStep[];
  illegal: string;
  blockTitle: string;
  blockText: string;
  /** What another piece in the way does: the reach with the pieces marked, then `blockMove`. */
  blockSteps: [string, string];
  blockMove: string;
  slider: boolean;
  tip?: string;
  /** Prefer start squares away from the edge for the first example. */
  showcase: Square;
}

/* ---------- exercise generators ---------- */

function reachRounds(p: PieceInfo, n: number, withBlocker: boolean): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const from = pick(ALL_SQUARES.filter((s) => fileIndex(s) > 0 && fileIndex(s) < 7 && rankOf(s) > 1 && rankOf(s) < 8));
    const pieces: Pieces = { [from]: p.char };
    let behind: Square | null = null;
    let blocker: Square | null = null;
    if (withBlocker && p.slider) {
      // Put a white pawn on a line, with at least one square behind it.
      const rays = reach({ [from]: p.char }, from).filter((s) => PAWN_SQUARES.includes(s));
      const candidates = shuffle(rays).filter((s) => {
        const df = Math.sign(fileIndex(s) - fileIndex(from));
        const dr = Math.sign(rankOf(s) - rankOf(from));
        const b = toSquare(fileIndex(s) + df, rankOf(s) + dr);
        const dist = Math.max(Math.abs(fileIndex(s) - fileIndex(from)), Math.abs(rankOf(s) - rankOf(from)));
        return b && dist >= 2;
      });
      if (!candidates.length) continue;
      blocker = candidates[0];
      const df = Math.sign(fileIndex(blocker) - fileIndex(from));
      const dr = Math.sign(rankOf(blocker) - rankOf(from));
      behind = toSquare(fileIndex(blocker) + df, rankOf(blocker) + dr);
      pieces[blocker] = "P";
    }
    const reachable = reach(pieces, from);
    const unreachable = ALL_SQUARES.filter((s) => s !== from && s !== blocker && !reachable.includes(s));
    const good = pickDistinct(reachable, 1);
    const bad = pickDistinct(unreachable.filter((s) => s !== behind), behind ? 2 : 3);
    const candidates = shuffle([...good, ...bad, ...(behind ? [behind] : [])]);
    if (candidates.length < 4) continue;
    const targets = candidates.filter((c) => reachable.includes(c));
    out.push({
      kind: "tap",
      key: `alcance:${p.char}:${from}${blocker ? `:${blocker}` : ""}`,
      prompt: `Toque na casa marcada que ${p.the} alcança em um lance.`,
      board: { fen: fenOf(pieces), marks: marksFor(candidates, "ring") },
      targets,
      wrong: (t: Square) => {
        if (!candidates.includes(t)) return "Escolha uma das casas marcadas com contorno.";
        if (t === behind) return `${p.The} não pula peças: o peão em \`${blocker}\` está no caminho.`;
        return `${p.The} não chega em \`${t}\` em um lance. ${p.illegal}`;
      },
      success: `${p.The} vai de \`${from}\` até \`${targets[0]}\` em um lance.`,
      reveal: { ...(marksFor(reachable, "soft") as Partial<Record<Square, "soft">>), [targets[0]]: "hint" },
      mistakeNote: `Casas que ${p.the} alcança`,
    });
  }
  return out;
}

function captureRounds(p: PieceInfo, n: number): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 300) {
    const from = pick(ALL_SQUARES);
    const reachable = reach({ [from]: p.char }, from).filter((s) => PAWN_SQUARES.includes(s));
    if (!reachable.length) continue;
    const target = pick(reachable);
    const pieces: Pieces = { [from]: p.char, [target]: "p" };
    const decoys = pickDistinct(
      PAWN_SQUARES.filter((s) => s !== from && s !== target && !reach({ [from]: p.char }, from).includes(s)),
      2,
    );
    for (const d of decoys) pieces[d] = "p";
    const moves = legalMoves(fenOf(pieces), from);
    const captures = moves.filter((m) => m.captured);
    if (captures.length !== 1) continue;
    out.push({
      kind: "move",
      key: `captura:${p.char}:${from}:${target}`,
      prompt: `Capture o peão preto que ${p.the} alcança.`,
      board: { fen: fenOf(pieces) },
      accept: (m) => Boolean(m.captured),
      solution: uciOf(captures[0]),
      wrong: (m) => `${p.The} foi para \`${m.to}\` sem capturar nada. Procure o peão preto que está no caminho.`,
      illegal: p.illegal,
      success: `Capturar é ir para a casa da peça adversária e tirá-la do tabuleiro.`,
      mistakeNote: `Captura com ${p.the}`,
    });
  }
  return out;
}

/** Stars dropped along a random walk of the piece, so they are always reachable and close. */
function pathRounds(p: PieceInfo, starCounts: number[]): Screen[] {
  return starCounts.map((count) => {
    for (let guard = 0; guard < 200; guard++) {
      const from = pick(ALL_SQUARES);
      const visited: Square[] = [];
      let at = from;
      for (let k = 0; k < count + 1; k++) {
        const next = pick(pieceDestinations(p.char, at, () => undefined).filter((s) => s !== from && !visited.includes(s)));
        if (!next) break;
        visited.push(next);
        at = next;
      }
      if (visited.length < count) continue;
      const stars = pickDistinct(visited, count);
      const fen = fenOf({ [from]: p.char });
      const sol = solvePath(fen, from, stars, 8);
      if (!sol || sol.length < count) continue;
      const screen: Screen = {
        kind: "path",
        key: `estrelas:${p.char}:${from}:${stars.join(",")}`,
        prompt:
          count === 1
            ? `Leve ${p.the} até a estrela.`
            : `Leve ${p.the} por todas as ${count} estrelas, em qualquer ordem, no menor número de lances.`,
        board: { fen },
        targets: stars,
        par: sol.length,
        illegal: p.illegal,
        success: "",
        mistakeNote: `Caminho com ${p.the}`,
      };
      return screen;
    }
    throw new Error(`could not build path for ${p.char}`);
  });
}

/** The board of the second explanation: what other pieces in the way do to the reach. */
function blockPieces(p: PieceInfo): { pieces: Pieces; marks: Partial<Record<Square, MarkKind>> } {
  if (p.char === "N") return { pieces: { b1: "N", a2: "P", b2: "P", c2: "P", d2: "P" }, marks: marksFor(["a2", "b2", "c2", "d2"], "soft") };
  if (p.char === "K") return { pieces: { e4: "K", d5: "p", f4: "P" }, marks: { f4: "bad", d5: "focus" } };
  const pieces: Pieces = { d4: p.char, d6: "P", f6: "P", f4: "p", b2: "p" };
  const r = reach(pieces, "d4");
  const marks: Partial<Record<Square, MarkKind>> = {};
  for (const own of ["d6", "f6"] as Square[]) {
    // An own piece is marked where it stops the line: the square before it is reached.
    const before = toSquare(fileIndex(own) + Math.sign(fileIndex("d4") - fileIndex(own)), rankOf(own) + Math.sign(rankOf("d4") - rankOf(own)));
    if (before && (r.includes(before) || before === "d4")) marks[own] = "bad";
  }
  for (const theirs of ["f4", "b2"] as Square[]) if (r.includes(theirs)) marks[theirs] = "focus";
  return { pieces, marks };
}

/** The far end of each line of a long-range piece from `sq`, for its arrows. */
function lines(p: PieceInfo, sq: Square): { from: Square; to: Square }[] {
  const dirs: [number, number][] =
    p.char === "R" ? [[0, 1], [0, -1], [1, 0], [-1, 0]] : p.char === "B" ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  return dirs.flatMap(([df, dr]) => {
    let last: Square | null = null;
    for (let k = 1; k < 8; k++) {
      const next = toSquare(fileIndex(sq) + df * k, rankOf(sq) + dr * k);
      if (!next) break;
      last = next;
    }
    return last ? [{ from: sq, to: last }] : [];
  });
}

/** Plays a piece's moves on a set of pieces, returning where the moved piece stands. */
function playOn(pieces: Pieces, moves: string[], at: Square): Square {
  for (const uci of moves) {
    const from = uci.slice(0, 2) as Square;
    const to = uci.slice(2, 4) as Square;
    pieces[to] = pieces[from];
    delete pieces[from];
    if (from === at) at = to;
  }
  return at;
}

/** "Como a torre anda": the piece's reach and a few of its moves, on the board. */
function moveScreen(p: PieceInfo): ExplainScreen {
  const start: Pieces = { [p.showcase]: p.char, ...(p.char === "N" ? { d5: "P", e5: "P" } : {}) };
  const pieces: Pieces = { ...start };
  let at = p.showcase;
  const demo: DemoFrame[] = p.moveSteps.map((step) => {
    at = playOn(pieces, step.moves ?? [], at);
    return {
      moves: step.moves,
      area: step.reach ? reach(pieces, at) : undefined,
      arrows: step.lines ? lines(p, at) : undefined,
    };
  });
  return { kind: "explain", title: `Como ${p.the} anda`, text: p.moveText, steps: p.moveSteps.map((st) => st.text), board: { fen: fenOf(start) }, demo, tip: p.tip };
}

/** What another piece in the way does: the reach with the pieces marked, then the move past or onto one. */
function blockScreen(p: PieceInfo): ExplainScreen {
  const { pieces, marks } = blockPieces(p);
  const from = Object.entries(pieces).find(([, c]) => c === p.char)![0] as Square;
  return {
    kind: "explain",
    title: p.blockTitle,
    text: p.blockText,
    steps: p.blockSteps,
    board: { fen: fenOf(pieces) },
    demo: [{ area: reach(pieces, from), marks }, { moves: [p.blockMove] }],
  };
}

export function pieceLesson(id: string, p: PieceInfo): LessonDef {
  return {
    id,
    title: p.name[0].toUpperCase() + p.name.slice(1),
    summary: p.moveText.replace(/\*\*/g, ""),
    minutes: 3,
    build: () => [
      moveScreen(p),
      ...reachRounds(p, 2, false),
      ...pathRounds(p, [1, 2]),
      blockScreen(p),
      ...(p.slider ? reachRounds(p, 1, true) : []),
      ...captureRounds(p, 2),
      ...pathRounds(p, [3]),
    ],
  };
}

/* ---------- the pieces ---------- */

export const lessonTorre = pieceLesson("m2-l1", {
  char: "R",
  name: "torre",
  the: "a torre",
  The: "A torre",
  moveText: "A **torre** anda em linha reta, quantas casas quiser.",
  moveSteps: [
    { text: "De `d4`, siga a coluna e a fileira, nas quatro direções: são 14 casas.", reach: true, lines: true },
    { text: "Escolha uma direção e pare onde quiser, sem fazer curva.", moves: ["d4d7"] },
    { text: "Em qualquer casa do tabuleiro vazio, a torre alcança as mesmas 14.", moves: ["d7a7"], reach: true },
  ],
  illegal: "A torre só anda em linha reta, pela coluna ou pela fileira em que está.",
  blockTitle: "Ela não pula peças",
  blockText: "A torre não passa por cima de ninguém.",
  blockSteps: ["Uma peça sua no caminho: a torre para antes dela.", "Uma peça do adversário: ela captura e fica no lugar dela."],
  blockMove: "d4f4",
  slider: true,
  showcase: "d4",
});

export const lessonBispo = pieceLesson("m2-l2", {
  char: "B",
  name: "bispo",
  the: "o bispo",
  The: "O bispo",
  moveText: "O **bispo** anda na diagonal, quantas casas quiser. Por isso fica a partida inteira na mesma cor.",
  moveSteps: [
    { text: "De `d4`, siga as quatro diagonais: são 13 casas.", reach: true, lines: true },
    { text: "Escolha uma diagonal e pare onde quiser.", moves: ["d4h8"] },
    { text: "No canto sobra uma diagonal só: 7 casas. Por isso o bispo rende mais no centro.", reach: true },
  ],
  illegal: "O bispo só anda na diagonal.",
  blockTitle: "Ele não pula peças",
  blockText: "O bispo não passa por cima de ninguém.",
  blockSteps: ["Uma peça sua na diagonal: o bispo para antes dela.", "Uma peça do adversário: ele captura e fica no lugar dela."],
  blockMove: "d4b2",
  slider: true,
  tip: "Cada lado tem um bispo das casas claras e um das escuras.",
  showcase: "d4",
});

export const lessonDama = pieceLesson("m2-l3", {
  char: "Q",
  name: "dama",
  the: "a dama",
  The: "A dama",
  moveText: "A **dama** junta a torre e o bispo: anda em linha reta e na diagonal, quantas casas quiser.",
  moveSteps: [
    { text: "De `d4`, são as 14 casas da torre mais as 13 do bispo: 27.", reach: true, lines: true },
    { text: "Escolha uma das oito direções e pare onde quiser.", moves: ["d4a7"] },
    { text: "Na borda, ela perde casas: daqui, alcança 21.", reach: true },
  ],
  illegal: "A dama anda em linha reta ou na diagonal, sem fazer curvas.",
  blockTitle: "Forte, mas sem pular",
  blockText: "Como a torre e o bispo, a dama não passa por cima de ninguém.",
  blockSteps: ["Uma peça sua no caminho: a dama para antes dela.", "Uma peça do adversário: ela captura a primeira que encontrar."],
  blockMove: "d4f4",
  slider: true,
  tip: "É a peça mais forte. Vale quase o mesmo que duas torres.",
  showcase: "d4",
});

export const lessonRei = pieceLesson("m2-l4", {
  char: "K",
  name: "rei",
  the: "o rei",
  The: "O rei",
  moveText: "O **rei** anda para qualquer lado, mas só uma casa por vez.",
  moveSteps: [
    { text: "De `e4`, são as 8 casas em volta dele.", reach: true },
    { text: "Cada lance, uma casa.", moves: ["e4e5"] },
    { text: "No canto, sobram 3.", moves: ["e5f6", "f6g7", "g7h8"], reach: true },
  ],
  illegal: "O rei anda só uma casa por vez, em qualquer direção.",
  blockTitle: "O rei também captura",
  blockText: "O rei captura como as outras peças. No módulo 3 você vai ver quando isso é perigoso.",
  blockSteps: ["Uma casa ao lado com peça sua fica fechada para ele.", "Uma peça do adversário ao lado: o rei pode capturá-la."],
  blockMove: "e4d5",
  slider: false,
  tip: "O rei é lento, mas é a peça que decide a partida.",
  showcase: "e4",
});

export const lessonCavalo = pieceLesson("m2-l5", {
  char: "N",
  name: "cavalo",
  the: "o cavalo",
  The: "O cavalo",
  moveText: "O **cavalo** anda em L e é a única peça que pula as outras.",
  moveSteps: [
    { text: "Duas casas em linha reta e mais uma para o lado: de `d4`, são 8 casas.", reach: true },
    { text: "Peça no caminho não atrapalha: ele pula por cima.", moves: ["d4e6"] },
    { text: "No canto, sobram 2. Cavalo na borda rende pouco.", moves: ["e6c7", "c7a8"], reach: true },
  ],
  illegal: "O cavalo anda em L: duas casas em uma direção e depois uma para o lado.",
  blockTitle: "O cavalo pula",
  blockText: "O cavalo só não pode cair numa casa com peça sua.",
  blockSteps: ["No começo, os peões cercam o cavalo, e `d2` está ocupada.", "Ele sai mesmo assim, pulando por cima dos peões."],
  blockMove: "b1c3",
  slider: false,
  tip: "A cada lance, o cavalo troca de cor: de casa clara vai para escura e vice-versa.",
  showcase: "d4",
});
