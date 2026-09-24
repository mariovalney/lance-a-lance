import type { LessonDef, MarkKind, Screen } from "@/content/types";
import { puzzleRounds } from "@/content/lib/puzzles";
import { boardFor, isLegalPosition, placementToFen } from "@/content/lib/positions";
import { legalMoves, uciOf } from "@/lib/chess/game";
import { ALL_SQUARES, fileIndex, rankOf, toSquare, type Square } from "@/lib/chess/squares";
import { pick, randInt, shuffle } from "@/lib/random";

type Pieces = Partial<Record<Square, string>>;
const dist = (a: Square, b: Square) => Math.max(Math.abs(fileIndex(a) - fileIndex(b)), Math.abs(rankOf(a) - rankOf(b)));

/* ---------- 11.1 regra do quadrado ---------- */

/** Squares of the pawn's "square" (white pawn, not on rank 2). */
function squareOf(pawn: Square): Square[] {
  const d = 8 - rankOf(pawn);
  return ALL_SQUARES.filter((s) => Math.abs(fileIndex(s) - fileIndex(pawn)) <= d && rankOf(s) >= rankOf(pawn) && (fileIndex(s) - fileIndex(pawn)) * (fileIndex(pawn) < 4 ? 1 : -1) >= 0);
}

/** Black to move catches the pawn iff the king can step into the square now. */
function catches(pawn: Square, bk: Square): boolean {
  const d = 8 - rankOf(pawn);
  return Math.abs(fileIndex(bk) - fileIndex(pawn)) <= d + 1 && rankOf(bk) >= rankOf(pawn) - 1;
}

interface Race {
  fen: string;
  pawn: Square;
  bk: Square;
  wk: Square;
}

function makeRace(wantCatch: boolean | null): Race | null {
  for (let guard = 0; guard < 500; guard++) {
    const pf = randInt(0, 7);
    const pr = randInt(3, 5);
    const pawn = toSquare(pf, pr)!;
    const towardCenter = pf < 4 ? 1 : -1;
    const bk = toSquare(pf + towardCenter * randInt(2, 6), randInt(Math.max(1, pr - 2), 8));
    if (!bk) continue;
    // White king far away on the other side, not helping.
    const wk = toSquare(pf < 4 ? 7 : 0, pick([1, 2]))!;
    if (dist(wk, pawn) < 4 || dist(wk, bk) < 3 || dist(bk, pawn) < 2) continue;
    const c = catches(pawn, bk);
    if (wantCatch !== null && c !== wantCatch) continue;
    const fen = placementToFen({ [pawn]: "P", [bk]: "k", [wk]: "K" } as Pieces, "b - - 0 1");
    if (!isLegalPosition(fen)) continue;
    return { fen, pawn, bk, wk };
  }
  return null;
}

function raceChoice(): Screen[] {
  return shuffle([true, false, Math.random() < 0.5]).flatMap((want) => {
    const r = makeRace(want);
    if (!r) return [];
    const c = catches(r.pawn, r.bk);
    const marks = Object.fromEntries(squareOf(r.pawn).map((s) => [s, "soft" as MarkKind]));
    return [
      {
        kind: "choice",
        key: `quadrado:${r.fen}`,
        prompt: "Pretas jogam. O rei preto alcança o peão antes da promoção?",
        board: { fen: r.fen },
        revealBoard: { fen: r.fen, marks: { ...marks, [r.bk]: c ? "good" : "bad" } },
        options: [
          { id: "sim", label: "Alcança" },
          { id: "nao", label: "Não alcança" },
        ],
        correct: c ? "sim" : "nao",
        explain: c
          ? "Alcança: com um passo o rei entra no quadrado do peão (marcado) e chega a tempo."
          : "Não alcança: nem com um passo o rei entra no quadrado do peão (marcado). O peão vira dama.",
        mistakeNote: "Regra do quadrado",
      } satisfies Screen,
    ];
  });
}

function enterSquareMove(): Screen | null {
  for (let guard = 0; guard < 200; guard++) {
    const r = makeRace(true);
    if (!r) continue;
    const inside = (sq: Square) => squareOf(r.pawn).includes(sq) || (Math.abs(fileIndex(sq) - fileIndex(r.pawn)) <= 8 - rankOf(r.pawn) && rankOf(sq) >= rankOf(r.pawn));
    const moves = legalMoves(r.fen);
    const good = moves.filter((m) => inside(m.to as Square));
    if (!good.length || good.length === moves.length) continue;
    return {
      kind: "move",
      key: `entrar-quadrado:${r.fen}`,
      prompt: "Pretas jogam. Leve o rei para dentro do quadrado do peão para alcançá-lo.",
      board: boardFor(r.fen),
      accept: (m) => inside(m.to as Square),
      solution: uciOf(good[0]),
      wrong: () => "Esse passo deixa o rei fora do quadrado: o peão chega primeiro. Vá na direção da casa de promoção.",
      success: "Dentro do quadrado: o rei alcança o peão.",
      mistakeNote: "Entrar no quadrado",
    };
  }
  return null;
}

/* ---------- 11.2 oposição ---------- */

function oppositionChoice(): Screen[] {
  return [0, 1, 2].flatMap(() => {
    for (let guard = 0; guard < 200; guard++) {
      const f = randInt(1, 6);
      const r = randInt(2, 5);
      const vertical = Math.random() < 0.7;
      const wk = toSquare(f, r)!;
      const bk = vertical ? toSquare(f, r + 2) : toSquare(f + 2, r);
      if (!bk) continue;
      const turn = pick(["w", "b"]);
      const pawn = toSquare(f, r - 1);
      const pieces: Pieces = { [wk]: "K", [bk]: "k" };
      if (pawn && rankOf(pawn) >= 2 && vertical) pieces[pawn] = "P";
      const fen = placementToFen(pieces, `${turn} - - 0 1`);
      if (!isLegalPosition(fen)) continue;
      const holder = turn === "w" ? "pretas" : "brancas";
      return [
        {
          kind: "choice",
          key: `oposicao:${fen}`,
          prompt: `${turn === "w" ? "Brancas" : "Pretas"} jogam. Quem tem a oposição?`,
          board: { fen, marks: { [wk]: "focus", [bk]: "focus" } },
          options: [
            { id: "brancas", label: "Brancas" },
            { id: "pretas", label: "Pretas" },
          ],
          correct: holder,
          explain: `Os reis estão frente a frente com uma casa entre eles. Quem tem a oposição é quem **não** precisa jogar: as ${holder}. O outro rei é obrigado a ceder espaço.`,
          mistakeNote: "Quem tem a oposição",
        } satisfies Screen,
      ];
    }
    return [];
  });
}

function takeOpposition(): Screen | null {
  for (let guard = 0; guard < 300; guard++) {
    const f = randInt(1, 6);
    const r = randInt(3, 5);
    const bk = toSquare(f + pick([-1, 1]), r + 2);
    const wk = toSquare(f, r - 1 + pick([0, 1]) - 1);
    const pawn = toSquare(f, 2);
    if (!bk || !wk || !pawn || wk === pawn || dist(wk, bk) < 2) continue;
    const pieces: Pieces = { [wk]: "K", [bk]: "k", [pawn]: "P" };
    const fen = placementToFen(pieces, "w - - 0 1");
    if (!isLegalPosition(fen)) continue;
    const opposed = (a: Square) =>
      (fileIndex(a) === fileIndex(bk) && Math.abs(rankOf(a) - rankOf(bk)) === 2) || (rankOf(a) === rankOf(bk) && Math.abs(fileIndex(a) - fileIndex(bk)) === 2);
    const moves = legalMoves(fen).filter((m) => m.piece === "k");
    const good = moves.filter((m) => opposed(m.to as Square));
    if (!good.length || good.length === legalMoves(fen).length) continue;
    return {
      kind: "move",
      key: `tomar-oposicao:${fen}`,
      prompt: "Tome a oposição: coloque o seu rei de frente para o rei preto, com uma casa entre eles.",
      board: { fen },
      accept: (m) => m.piece === "k" && opposed(m.to as Square),
      solution: uciOf(good[0]),
      wrong: () => "Os reis precisam ficar na mesma coluna (ou fileira), com exatamente uma casa entre eles, e as pretas na vez de jogar.",
      success: "Oposição! Agora o rei preto precisa ceder passagem.",
      mistakeNote: "Tomar a oposição",
    };
  }
  return null;
}

/* ---------- 11.3 rei e peão ---------- */

/** Key squares of a white pawn (not a rook pawn). */
function keySquares(pawn: Square): Square[] {
  const f = fileIndex(pawn);
  const r = rankOf(pawn);
  const rows = r <= 4 ? [r + 2] : [r + 1, r + 2];
  return rows.flatMap((row) => [f - 1, f, f + 1].map((ff) => toSquare(ff, row)).filter((s): s is Square => !!s && rankOf(s) <= 8));
}

function keySquareMove(): Screen | null {
  for (let guard = 0; guard < 500; guard++) {
    const pf = randInt(1, 6);
    const pr = randInt(2, 4);
    const pawn = toSquare(pf, pr)!;
    const keys = keySquares(pawn);
    const target = pick(keys);
    const wk = pick(ALL_SQUARES.filter((s) => dist(s, target) === 1 && !keys.includes(s) && s !== pawn && rankOf(s) > pr));
    if (!wk) continue;
    const bk = pick(ALL_SQUARES.filter((s) => dist(s, pawn) >= 3 && dist(s, wk) >= 2 && !keys.includes(s) && rankOf(s) >= pr + 2));
    if (!bk) continue;
    const fen = placementToFen({ [pawn]: "P", [wk]: "K", [bk]: "k" } as Pieces, "w - - 0 1");
    if (!isLegalPosition(fen)) continue;
    const moves = legalMoves(fen);
    const good = moves.filter((m) => m.piece === "k" && keys.includes(m.to as Square));
    if (!good.length || good.length === moves.length) continue;
    return {
      kind: "move",
      key: `casa-chave:${fen}`,
      prompt: "Leve o rei para uma **casa-chave** (marcadas): dali o peão promove, faça o que fizer o rei preto.",
      board: { fen, marks: Object.fromEntries(keys.map((k) => [k, "soft" as MarkKind])) },
      accept: (m) => m.piece === "k" && keys.includes(m.to as Square),
      solution: uciOf(good[0]),
      wrong: (m) => (m.piece === "p" ? "Calma com o peão: primeiro o rei vai na frente, para uma casa-chave." : "Essa casa não é casa-chave. Procure as marcadas, à frente do peão."),
      success: "Rei na casa-chave: vitória garantida com técnica.",
      mistakeNote: "Casa-chave do peão",
    };
  }
  return null;
}

/* ---------- 11.4 Lucena and 11.5 Philidor ---------- */

const LUCENA_FEN = "1K6/1P1k4/8/8/8/8/r7/2R5 w - - 0 1";
const PHILIDOR_FEN = "4k3/R7/1r2P3/3K4/8/8/8/8 b - - 0 1";

function lucenaLine(): Screen {
  return {
    kind: "sequence",
    key: "lucena-ponte",
    prompt: "Posição de Lucena. Construa a ponte: empurre o rei preto, coloque a torre na 4ª fileira e saia com o rei.",
    board: boardFor(LUCENA_FEN),
    line: ["c1d1", "d7e7", "d1d4", "a2a1", "b8c7", "a1c1", "c7b6", "c1b1", "b6c6", "b1c1", "c6b5", "c1b1", "d4b4"],
    comments: [
      "Xeque para afastar o rei preto mais uma coluna.",
      "A ponte: a torre vai para a 4ª fileira, para bloquear os xeques depois.",
      "O rei sai da frente do peão.",
      "Aproxima o rei da torre, fugindo dos xeques.",
      "Continua descendo.",
      "Mais perto da ponte.",
      "Ponte pronta: a torre bloqueia o xeque e o peão vai promover.",
    ],
    wrong: (_m, i) =>
      [
        "Primeiro dê xeque na coluna `d` para afastar o rei: `Rd1+`.",
        "Leve a torre para `d4`: é a ponte que vai bloquear os xeques.",
        "Saia com o rei para `c7`.",
        "Rei para `b6`, perto da torre.",
        "Rei para `c6`.",
        "Rei para `b5`.",
        "Bloqueie com a torre em `b4`.",
      ][i] ?? "Siga o plano da ponte.",
    success: "Essa é a técnica de Lucena, a vitória mais importante dos finais de torre.",
    mistakeNote: "Lucena: construir a ponte",
  };
}

function philidorMove(): Screen {
  return {
    kind: "move",
    key: "philidor-atras",
    prompt: "Posição de Philidor, você defende com as pretas. O peão branco chegou à 6ª fileira. Qual é o lance da defesa?",
    board: boardFor(PHILIDOR_FEN, { lastMove: ["e5", "e6"] }),
    accept: (m) => m.piece === "r" && rankOf(m.to as Square) <= 2,
    solution: "b6b1",
    wrong: (m) =>
      m.piece === "r"
        ? "Com o peão na 6ª, a torre vai para longe, para dar xeques por trás do rei branco: `Rb1`."
        : "O rei fica onde está, na frente do peão. Quem trabalha agora é a torre.",
    success: "Agora o rei branco não tem onde se esconder dos xeques por trás. É empate.",
    mistakeNote: "Philidor: xeques por trás",
  };
}

function compact(list: (Screen | null)[]): Screen[] {
  return list.filter((s): s is Screen => Boolean(s));
}

export const lessonQuadrado: LessonDef = {
  id: "m11-l1",
  title: "Regra do quadrado",
  summary: "Saiba na hora se o rei alcança um peão passado.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "O quadrado do peão",
      text: "Imagine um quadrado do peão até a casa de promoção. Se o rei adversário conseguir **entrar no quadrado** na vez dele, ele alcança o peão. Se não, o peão vira dama.",
      board: {
        fen: "8/8/3k4/P7/8/8/8/7K b - - 0 1",
        marks: Object.fromEntries(squareOf("a5").map((s) => [s, "soft" as MarkKind])),
      },
      tip: "Peão ainda na casa inicial conta como se estivesse uma casa à frente, por causa do avanço duplo.",
    },
    ...raceChoice(),
    ...compact([enterSquareMove()]),
  ],
};

export const lessonOposicao: LessonDef = {
  id: "m11-l2",
  title: "Oposição",
  summary: "Reis frente a frente: quem não precisa jogar ganha a briga.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Oposição",
      text: "Quando os reis ficam frente a frente com **uma casa entre eles**, nenhum pode avançar. Quem precisa jogar tem que ceder espaço. Quem **não** precisa jogar tem a oposição.",
      board: { fen: "8/8/4k3/8/4K3/4P3/8/8 b - - 0 1", marks: { e4: "focus", e6: "focus", e5: "bad" } },
    },
    ...oppositionChoice(),
    ...compact([takeOpposition(), takeOpposition()]),
  ],
};

export const lessonReiPeao: LessonDef = {
  id: "m11-l3",
  title: "Rei e peão contra rei",
  summary: "Rei na frente do peão, nas casas-chave, e a promoção sai.",
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "Casas-chave",
      text: "Cada peão tem **casas-chave**: se o seu rei chegar a uma delas, o peão promove. Para um peão até a 4ª fileira, são as três casas duas fileiras à frente dele.",
      board: { fen: "8/8/8/8/8/4P3/8/4K2k w - - 0 1", marks: { d5: "good", e5: "good", f5: "good" } },
      tip: "Regra prática: rei na frente do peão, não atrás dele.",
    },
    ...compact([keySquareMove(), keySquareMove()]),
    ...puzzleRounds("pawnEndgame", 3, {
      lookFor: "o plano que vence (ou salva) o final",
      hint: "Pense em oposição, casas-chave e na regra do quadrado.",
      success: "Final de peões resolvido.",
      note: "Finais de peões",
    }),
  ],
};

export const lessonLucena: LessonDef = {
  id: "m11-l4",
  title: "Posição de Lucena",
  summary: "Como vencer o final de torre e peão: construa a ponte.",
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "A posição de Lucena",
      text: "Rei na frente do próprio peão, na 7ª fileira, e o rei adversário cortado por uma coluna. O rei quer sair, mas os xeques atrapalham. A solução é a **ponte**: a torre na 4ª fileira bloqueia os xeques.",
      board: { fen: LUCENA_FEN, marks: { b8: "focus", b7: "focus", d7: "soft" }, arrows: [{ from: "c1", to: "d1", tone: "hint" }] },
    },
    lucenaLine(),
    ...puzzleRounds("rookEndgame", 2, {
      lookFor: "o melhor lance neste final de torre",
      hint: "Torre ativa e rei ativo decidem os finais de torre.",
      success: "Final de torre resolvido.",
      note: "Finais de torre",
    }),
  ],
};

export const lessonPhilidor: LessonDef = {
  id: "m11-l5",
  title: "Posição de Philidor",
  summary: "Como empatar o final de torre com um peão a menos.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "A defesa de Philidor",
      text: "Com o rei na frente do peão, deixe a torre na **6ª fileira** (a 3ª do seu lado), impedindo o rei branco de avançar. Quando o peão chegar a essa fileira, a torre vai para longe e dá **xeques por trás**.",
      steps: ["Rei na frente do peão.", "Torre na 6ª fileira enquanto o peão não chega nela.", "Peão na 6ª: torre para a 1ª fileira e xeques por trás."],
      board: { fen: "4k3/R7/1r6/3KP3/8/8/8/8 w - - 0 1", arrows: [{ from: "b6", to: "h6", tone: "hint" }] },
    },
    philidorMove(),
    ...puzzleRounds("rookEndgame", 2, {
      lookFor: "o melhor lance neste final de torre",
      hint: "Torre ativa e rei ativo decidem os finais de torre.",
      success: "Final de torre resolvido.",
      note: "Finais de torre",
      skip: 10,
    }),
  ],
};

