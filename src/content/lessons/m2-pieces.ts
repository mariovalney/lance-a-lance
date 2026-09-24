import type { BoardSpec, LessonDef, MarkKind, Screen } from "@/content/types";
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

interface PieceInfo {
  char: "R" | "B" | "Q" | "K" | "N";
  name: string;
  /** "a torre", "o bispo" */
  the: string;
  /** "A torre", "O bispo" */
  The: string;
  moveText: string;
  illegal: string;
  blockTitle: string;
  blockText: string;
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
      success: `Isso. ${p.The} vai de \`${from}\` até \`${targets[0]}\` em um lance.`,
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
  return starCounts.map((count, i) => {
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
        success: i === starCounts.length - 1 ? "Você já pensa como a peça anda." : "Boa!",
        mistakeNote: `Caminho com ${p.the}`,
      };
      return screen;
    }
    throw new Error(`could not build path for ${p.char}`);
  });
}

function blockBoard(p: PieceInfo): BoardSpec {
  if (p.char === "N") {
    const pieces: Pieces = { b1: "N", a2: "P", b2: "P", c2: "P", d2: "P" };
    return { fen: fenOf(pieces), arrows: [{ from: "b1", to: "a3" }, { from: "b1", to: "c3" }] };
  }
  if (p.char === "K") {
    const pieces: Pieces = { e4: "K", d5: "p", f4: "P" };
    return { fen: fenOf(pieces), marks: { ...marksFor(reach(pieces, "e4"), "soft"), d5: "focus" } };
  }
  const pieces: Pieces = { d4: p.char, d6: "P", f6: "P", f4: "p", b2: "p" };
  const r = reach(pieces, "d4");
  return { fen: fenOf(pieces), marks: { ...marksFor(r, "soft"), ...(r.includes("f4") ? { f4: "focus" } : {}), ...(r.includes("b2") ? { b2: "focus" } : {}) } };
}

function showcaseBoard(p: PieceInfo): BoardSpec {
  const sq = p.showcase;
  const pieces: Pieces = { [sq]: p.char };
  const r = reach(pieces, sq);
  const far = (df: number, dr: number) => {
    let last: Square | null = null;
    for (let k = 1; k < 8; k++) {
      const s = toSquare(fileIndex(sq) + df * k, rankOf(sq) + dr * k);
      if (!s) break;
      last = s;
      if (!p.slider) break;
    }
    return last;
  };
  const dirs: [number, number][] =
    p.char === "R" ? [[0, 1], [0, -1], [1, 0], [-1, 0]] : p.char === "B" ? [[1, 1], [1, -1], [-1, 1], [-1, -1]] : p.char === "N" ? [] : [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const arrows = dirs
    .map(([df, dr]) => far(df, dr))
    .filter((s): s is Square => !!s)
    .map((to) => ({ from: sq, to }));
  const knightArrows = p.char === "N" ? r.filter((to) => to === "e6" || to === "f3").map((to) => ({ from: sq, to })) : [];
  return { fen: fenOf(pieces), marks: marksFor(r, "soft"), arrows: p.char === "N" ? knightArrows : arrows };
}

export function pieceLesson(id: string, p: PieceInfo): LessonDef {
  return {
    id,
    title: p.name[0].toUpperCase() + p.name.slice(1),
    summary: p.moveText.replace(/\*\*/g, ""),
    minutes: 3,
    build: () => [
      { kind: "explain", title: `Como ${p.the} anda`, text: p.moveText, board: showcaseBoard(p), tip: p.tip },
      ...reachRounds(p, 2, false),
      ...pathRounds(p, [1, 2]),
      { kind: "explain", title: p.blockTitle, text: p.blockText, board: blockBoard(p) },
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
  moveText: "A **torre** anda em linha reta: para frente, para trás e para os lados, quantas casas quiser.",
  illegal: "A torre só anda em linha reta, pela coluna ou pela fileira em que está.",
  blockTitle: "Ela não pula peças",
  blockText: "A torre para antes de uma peça sua. Se a peça for do adversário, ela pode capturar, ocupando a casa dela.",
  slider: true,
  showcase: "d4",
});

export const lessonBispo = pieceLesson("m2-l2", {
  char: "B",
  name: "bispo",
  the: "o bispo",
  The: "O bispo",
  moveText: "O **bispo** anda na diagonal, quantas casas quiser. Por isso ele passa a partida inteira na mesma cor.",
  illegal: "O bispo só anda na diagonal.",
  blockTitle: "Ele não pula peças",
  blockText: "O bispo para antes de uma peça sua e pode capturar a primeira peça adversária que encontrar na diagonal.",
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
  illegal: "A dama anda em linha reta ou na diagonal, sem fazer curvas.",
  blockTitle: "Forte, mas sem pular",
  blockText: "Como a torre e o bispo, a dama para antes de uma peça sua e captura a primeira peça adversária no caminho.",
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
  illegal: "O rei anda só uma casa por vez, em qualquer direção.",
  blockTitle: "O rei também captura",
  blockText: "O rei pode capturar uma peça adversária que esteja ao lado dele. No módulo 3 você vai ver quando isso é perigoso.",
  slider: false,
  tip: "O rei é lento, mas é a peça que decide a partida.",
  showcase: "e4",
});

export const lessonCavalo = pieceLesson("m2-l5", {
  char: "N",
  name: "cavalo",
  the: "o cavalo",
  The: "O cavalo",
  moveText: "O **cavalo** anda em L: duas casas para um lado e uma para o outro. É a única peça que pula as outras.",
  illegal: "O cavalo anda em L: duas casas em uma direção e depois uma para o lado.",
  blockTitle: "O cavalo pula",
  blockText: "Peças no caminho não atrapalham o cavalo. Ele só não pode cair numa casa ocupada por peça sua.",
  slider: false,
  tip: "A cada lance, o cavalo troca de cor: de casa clara vai para escura e vice-versa.",
  showcase: "d4",
});
