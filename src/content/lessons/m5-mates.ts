import type { LessonDef, Screen } from "@/content/types";
import MATES from "@/content/data/mates.json";
import { MATE_IN_ONE_POOL } from "@/content/lessons/m3-l3-xeque-mate";
import { boardFor, isLegalPosition, mateMoves, placementToFen, randomVariant } from "@/content/lib/positions";
import { boxSize, boxSquares, judgeApproach, judgeShrink, kingsApart, threatenedPiece, type BoxRule } from "@/content/lib/box";
import { legalMoves, load, uciOf } from "@/lib/chess/game";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";
import { pick, pickDistinct, shuffle } from "@/lib/random";
import { puzzleRounds } from "@/content/lib/puzzles";

type Pool = keyof typeof MATES;

/* ---------- shared builders ---------- */

function mateInOne(fens: string[], n: number, key: string, prompt = "Dê xeque-mate em um lance."): Screen[] {
  return pickDistinct(fens, n).map((base) => {
    const fen = randomVariant(base, (f) => mateMoves(f).length > 0);
    return {
      kind: "sequence",
      key: `${key}:${fen}`,
      prompt,
      board: boardFor(fen),
      line: [uciOf(mateMoves(fen)[0])],
      anyMateAtEnd: true,
      wrong: (m) => `\`${m.san}\` não é mate. Procure um xeque que feche todas as fugas do rei.`,
      success: "Xeque-mate!",
      mistakeNote: "Mate em 1",
    } satisfies Screen;
  });
}

function mateInTwo(pool: Pool, n: number, key: string, hint: string): Screen[] {
  return pickDistinct(MATES[pool], n).map((base) => {
    const fen = randomVariant(base);
    return {
      kind: "play",
      key: `${key}:${fen}`,
      prompt: "**Mate em 2**: faça seu lance, o adversário responde, e então dê o mate.",
      board: boardFor(fen),
      goal: "mate",
      maxMoves: 2,
      mateIn: 2,
      hint,
      success: "",
      mistakeNote: "Mate em 2",
    } satisfies Screen;
  });
}

const dist = (a: string, b: string) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
const CENTRAL = ALL_SQUARES.filter((s) => "cdef".includes(s[0]) && "3456".includes(s[1]));

/** A fresh endgame to play from the start: black king in the middle. */
function fullGame(pieces: string[], maxMoves: number, key: string, hint: string, prompt: string): Screen {
  for (let guard = 0; guard < 500; guard++) {
    const bk = pick(CENTRAL);
    const wk = pick(ALL_SQUARES.filter((s) => dist(s, bk) >= 3));
    const placed: Partial<Record<Square, string>> = { [bk]: "k", [wk]: "K" };
    for (const p of pieces) placed[pick(ALL_SQUARES.filter((s) => !placed[s] && dist(s, bk) >= 2))] = p;
    const fen = placementToFen(placed, "w - - 0 1");
    if (!isLegalPosition(fen) || load(fen).isGameOver()) continue;
    const v = randomVariant(fen);
    return {
      kind: "play",
      key: `${key}:${v}`,
      prompt,
      board: boardFor(v),
      goal: "mate",
      maxMoves,
      hint,
      success: "",
      mistakeNote: key,
    };
  }
  throw new Error("could not build full game");
}

/** Piece letters placed at random: fen of a legal position, white to move, not over. */
function randomEnding(bk: Square, pieces: string[], near = false): string | null {
  const wk = pick(ALL_SQUARES.filter((s) => dist(s, bk) >= 2));
  const placed: Partial<Record<Square, string>> = { [bk]: "k", [wk]: "K" };
  pieces.forEach((p, i) => {
    // The first piece of a "near" position sits diagonally next to the king, which threatens it.
    const nextTo = near && i === 0;
    const free = ALL_SQUARES.filter((s) => !placed[s] && (nextTo ? dist(s, bk) === 1 && s[0] !== bk[0] && s[1] !== bk[1] : dist(s, bk) >= 2));
    placed[pick(free)] = p;
  });
  if (Object.keys(placed).length !== pieces.length + 2) return null;
  const fen = placementToFen(placed, "w - - 0 1");
  if (!isLegalPosition(fen) || load(fen).isGameOver()) return null;
  return fen;
}

const INNER = ALL_SQUARES.filter((s) => "bcdefg".includes(s[0]) && "234567".includes(s[1]));
const TOP_EDGE = ALL_SQUARES.filter((s) => s[1] === "8");

/**
 * Shrink the box with the pieces (`name` says which, in the feedback), judged
 * by `rule`. A "near" position has the lone king next to an undefended piece.
 */
function shrinkBox(pieces: string[], n: number, key: string, name: string, rule: BoxRule, prompt: string, near = false): Screen[] {
  const out: Screen[] = [];
  for (let guard = 0; out.length < n && guard < 5000; guard++) {
    const base = randomEnding(pick(INNER), pieces, near);
    if (!base || Boolean(threatenedPiece(base)) !== near || (!near && boxSize(base) < 10)) continue;
    const fen = randomVariant(base);
    if (out.some((s) => s.kind === "move" && s.board.fen === fen)) continue;
    const judge = judgeShrink(fen, name, rule);
    if (!judge.answers.length || (!near && judge.bestAfter >= judge.before) || mateMoves(fen).length) continue;
    out.push({
      kind: "move",
      key: `${key}:${fen}`,
      prompt,
      board: boardFor(fen),
      accept: judge.accept,
      solution: judge.answers[0],
      wrong: judge.wrong,
      success: judge.success,
      mistakeNote: near ? "Salvar a peça sem aumentar a caixa" : "Encolher a caixa",
    });
  }
  if (out.length < n) throw new Error(`could not build ${key}`);
  return out;
}

/** The box is as small as the pieces can make it: bring the king. */
function approachKing(pieces: string[], key: string, name: string): Screen {
  for (let guard = 0; guard < 20000; guard++) {
    const base = randomEnding(pick(TOP_EDGE), pieces);
    if (!base || boxSize(base) > 10 || threatenedPiece(base) || kingsApart(base) < 3) continue;
    const fen = randomVariant(base);
    const judge = judgeApproach(fen, name);
    if (!judge.answers.length) continue;
    const shrink = judgeShrink(fen, name, "smallest");
    if ((shrink.answers.length && shrink.bestAfter < judge.before) || mateMoves(fen).length) continue;
    return {
      kind: "move",
      key: `${key}:${fen}`,
      prompt: "A caixa não encolhe mais. Traga o seu rei para perto do outro.",
      board: boardFor(fen),
      accept: judge.accept,
      solution: judge.answers[0],
      wrong: judge.wrong,
      success: judge.success,
      mistakeNote: "Trazer o rei",
    };
  }
  throw new Error(`could not build ${key}`);
}

/* ---------- 5.1 mate em 1 ---------- */

export const lessonMateEm1: LessonDef = {
  id: "m5-l1",
  title: "Mate em 1",
  summary: "Ache o lance que termina a partida.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "Como achar o mate",
      text: "Todo mate começa com um **xeque**. Então olhe os xeques, um por um.",
      steps: [
        "Ache todos os lances que dão xeque.",
        "Para cada um, pergunte: o rei tem para onde fugir? Dá para colocar uma peça na frente? Dá para capturar quem deu o xeque?",
        "Três vezes não: é mate.",
      ],
      board: { fen: "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1", arrows: [{ from: "e1", to: "e8" }] },
      tip: "Comece pelos xeques das peças que chegam mais perto do rei.",
    },
    ...mateInOne(MATE_IN_ONE_POOL.filter((p) => p.transform !== false).map((p) => p.fen), 3, "m1-padrao"),
    {
      kind: "explain",
      title: "O rei ajuda",
      text: "No fim da partida, a dama ou a torre sozinha não dá mate. O seu rei chega perto e tira as casas de fuga do outro.",
      board: { fen: "4k3/4Q3/4K3/8/8/8/8/8 b - - 0 1", marks: { e8: "bad", d8: "soft", f8: "soft", d7: "soft", f7: "soft" } },
    },
    ...mateInOne([...MATES.kq1, ...MATES.kr1, ...MATES.krr1], 3, "m1-final"),
    ...puzzleRounds("mateIn1", 2, {
      lookFor: "o mate desta partida de verdade",
      hint: "Olhe os xeques, um por um.",
      success: "Xeque-mate!",
      note: "Mate em 1",
    }),
  ],
};

/* ---------- 5.2 mate do corredor ---------- */

const BACK_RANK = [
  "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
  "1k6/ppp5/8/8/8/8/5PPP/4R1K1 w - - 0 1",
  "6k1/5ppp/8/8/8/8/1Q3PPP/6K1 w - - 0 1",
  "2r3k1/5ppp/8/8/8/8/5PPP/2R1R1K1 w - - 0 1",
  "3r2k1/5ppp/8/8/8/8/5PPP/3RR1K1 w - - 0 1",
];

const BACK_RANK_DEFENSE = ["3r2k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1", "2r3k1/5ppp/8/8/8/1Q6/5PPP/6K1 w - - 0 1"];

function defenseRounds(n: number): Screen[] {
  return shuffle(BACK_RANK_DEFENSE)
    .slice(0, n)
    .map((base) => {
      const fen = randomVariant(base);
      const safe = legalMoves(fen).find((m) => {
        const g = load(fen);
        g.move(m);
        return mateMoves(g.fen()).length === 0;
      })!;
      return {
        kind: "move",
        key: `defesa-corredor:${fen}`,
        prompt: "O adversário ameaça mate do corredor. Faça um lance que evite o mate.",
        board: boardFor(fen),
        accept: (_m, after) => mateMoves(after.fen()).length === 0,
        solution: uciOf(safe),
        wrong: (m) => {
          const g = load(fen);
          g.move(m);
          const mate = mateMoves(g.fen())[0];
          return `Depois de \`${m.san}\`, vem \`${mate.san}\` e é mate. Abra uma casa de fuga para o rei ou proteja a última fileira.`;
        },
        success: "Mate evitado. Uma casa de fuga para o rei resolve muitos problemas.",
        mistakeNote: "Defender o mate do corredor",
      } satisfies Screen;
    });
}

/** The window a pawn opened: the square on the second rank the king can step to. */
const LUFT = ["6k1/5ppp/8/8/8/7P/5PP1/6K1 w - - 0 1", "6k1/5ppp/8/8/8/6P1/5P1P/6K1 w - - 0 1", "1k6/ppp5/8/8/8/P7/1PP5/1K6 w - - 0 1", "6k1/5ppp/8/8/8/5P2/6PP/6K1 w - - 0 1"];

function luftRound(): Screen {
  const fen = randomVariant(pick(LUFT));
  const king = legalMoves(fen).filter((m) => m.piece === "k");
  const home = king[0].from;
  const second = home[1] === "1" ? "2" : "7";
  const targets = [...new Set(king.filter((m) => m.to[1] === second).map((m) => m.to as Square))];
  return {
    kind: "tapAll",
    key: `janela:${fen}`,
    prompt: `Um peão já abriu a janela. Toque na casa para onde o rei pode fugir de um xeque na última fileira. ${targets.length > 1 ? `São ${targets.length}.` : ""}`.trim(),
    board: boardFor(fen),
    targets,
    wrong: () => "Procure ao lado do rei, na fileira da frente, a casa que o peão deixou livre.",
    success: "Com essa casa livre, a torre na última fileira dá só um xeque, não um mate.",
    mistakeNote: "A janela do rei",
  };
}

export const lessonCorredor: LessonDef = {
  id: "m5-l2",
  title: "Mate do corredor",
  summary: "O rei preso pelos próprios peões na última fileira.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "O corredor",
      text: "O rei ficou na última fileira, preso atrás dos próprios peões. Uma torre ou dama que chega ali dá mate.",
      steps: [
        "O rei dele está na última fileira?",
        "Os peões da frente dele ainda não andaram?",
        "Ninguém defende essa fileira? Então leve a torre ou a dama para lá.",
      ],
      board: { fen: "3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1", marks: { g8: "bad", f7: "soft", g7: "soft", h7: "soft" } },
    },
    ...mateInOne(BACK_RANK, 3, "corredor"),
    ...puzzleRounds("backRankMate", 2, {
      lookFor: "o mate do corredor desta partida de verdade",
      hint: "Qual peça chega na última fileira?",
      success: "Mate do corredor!",
      note: "Mate do corredor",
    }),
    {
      kind: "explain",
      title: "A janela",
      text: "Para não levar esse mate, abra uma **janela**: avance um peão da frente do rei, como `h3`. Faça isso num lance calmo, antes de o perigo aparecer.",
      board: { fen: "6k1/5pp1/7p/8/8/7P/5PP1/6K1 w - - 0 1", marks: { h2: "good", h7: "good" } },
      tip: "Outra defesa: deixe uma torre na última fileira, cuidando dela.",
    },
    luftRound(),
    ...defenseRounds(2),
  ],
};

/* ---------- 5.3 dama e rei ---------- */

/** The queen a knight's jump from the king: the box is what the marks show. */
const CAIXA = "8/8/3k4/8/2Q5/8/8/4K3 w - - 0 1";

export const lessonDamaRei: LessonDef = {
  id: "m5-l3",
  title: "Dama e rei contra rei",
  summary: "Prenda o rei com a dama e traga o seu rei para o mate.",
  minutes: 7,
  build: () => [
    {
      kind: "explain",
      title: "A caixa",
      text: "A **caixa** é o pedaço do tabuleiro onde o rei adversário ainda pode andar. O mate vem em quatro passos:",
      steps: [
        "Ponha a dama a um salto de cavalo do rei: ele fica preso numa caixa.",
        "Quando ele andar, ande com a dama e mantenha o salto de cavalo. A caixa encolhe.",
        "Com o rei dele na borda, pare de encolher e traga o seu rei.",
        "Com os reis perto, a dama dá o mate na borda.",
      ],
      board: { fen: CAIXA, marks: { ...Object.fromEntries(boxSquares(CAIXA).map((sq) => [sq, "soft"])), d6: "focus" } },
    },
    ...shrinkBox(["Q"], 2, "caixa-dama", "a dama", "knight", "Encolha a caixa: leve a dama a um salto de cavalo do rei."),
    approachKing(["Q"], "rei-dama", "a dama"),
    ...mateInOne(MATES.kq1, 2, "kq1"),
    {
      kind: "explain",
      title: "Cuidado com o afogamento",
      text: "Com o rei adversário no canto, antes de encostar a dama confira: ele ainda tem algum lance? Se não tiver e não for xeque, é empate.",
      board: { fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", marks: { h8: "bad" } },
    },
    ...mateInTwo("kq2", 2, "kq2", "Prenda o rei antes de dar xeque."),
    fullGame(["Q"], 16, "Dama e rei do começo", "Encolha a caixa, traga o seu rei, dê o mate na borda.", "Agora do começo: dê mate com dama e rei."),
  ],
};

/* ---------- 5.4 duas torres ---------- */

export const lessonDuasTorres: LessonDef = {
  id: "m5-l4",
  title: "Duas torres contra rei",
  summary: "O mate da escada: uma torre prende, a outra dá xeque.",
  minutes: 6,
  build: () => [
    {
      kind: "explain",
      title: "A escada",
      text: "As torres empurram o rei degrau por degrau até a borda, sem ajuda do seu rei:",
      steps: [
        "Uma torre fecha uma fileira (ou coluna): o rei não passa dela.",
        "A outra dá xeque na seguinte, e o rei recua.",
        "Elas se revezam, e a caixa perde uma fileira a cada vez.",
      ],
      board: {
        fen: "8/8/8/3k4/R7/1R6/8/6K1 w - - 0 1",
        arrows: [
          { from: "a4", to: "h4", tone: "hint" },
          { from: "b3", to: "b5" },
        ],
      },
      tip: "Se o rei chegar perto de uma torre, leve essa torre para o outro lado do tabuleiro.",
    },
    ...shrinkBox(["R", "R"], 2, "degrau", "uma torre", "check", "Suba um degrau: dê o xeque que empurra o rei para trás."),
    ...shrinkBox(["R", "R"], 1, "torre-ameacada", "uma torre", "keep", "O rei ameaça uma torre. Salve-a sem aumentar a caixa.", true),
    ...mateInOne(MATES.krr1, 2, "krr1"),
    ...mateInTwo("krr2", 2, "krr2", "Uma torre prende, a outra dá o xeque."),
    fullGame(["R", "R"], 12, "Duas torres do começo", "Suba a escada: fileira por fileira.", "Agora do começo: dê mate com as duas torres."),
  ],
};

/* ---------- 5.5 torre e rei ---------- */

export const lessonTorreRei: LessonDef = {
  id: "m5-l5",
  title: "Torre e rei contra rei",
  summary: "A torre corta, o rei empurra, e o mate sai na borda.",
  minutes: 7,
  build: () => [
    {
      kind: "explain",
      title: "Torre corta, rei empurra",
      text: "A torre sozinha não dá mate: ela prende, e o seu rei empurra.",
      steps: [
        "A torre **corta** o rei dele, prendendo-o de um lado do tabuleiro.",
        "O seu rei se aproxima e fica de frente para o dele.",
        "Com os reis frente a frente, a torre dá xeque e o rei dele recua.",
        "Na borda, esse xeque é mate.",
      ],
      board: { fen: "4k3/8/4K3/8/8/8/8/R7 w - - 0 1", arrows: [{ from: "a1", to: "a8" }], marks: { e8: "focus" } },
      tip: "Os reis frente a frente, com uma casa entre eles, é a chamada oposição.",
    },
    ...shrinkBox(["R"], 2, "caixa-torre", "a torre", "smallest", "Corte o rei com a torre: deixe-o com o menor número de casas."),
    approachKing(["R"], "rei-torre", "a torre"),
    ...mateInOne(MATES.kr1, 2, "kr1"),
    ...mateInTwo("kr2", 2, "kr2", "Às vezes um lance de espera com a torre força o rei a sair da frente."),
    fullGame(["R"], 25, "Torre e rei do começo", "Corte com a torre e aproxime o seu rei. Paciência.", "Agora do começo: dê mate com torre e rei. Se ficar difícil, pule e volte depois."),
  ],
};

/* ---------- 5.6 mate pastor ---------- */

const PASTOR_DEFENSE: { fen: string; solution: string }[] = [
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3", solution: "g7g6" },
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 3", solution: "g8f6" },
];

export const lessonPastor: LessonDef = {
  id: "m5-l6",
  title: "Mate pastor e como se defender",
  summary: "O mate mais famoso dos iniciantes, e a defesa simples.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "O ponto fraco",
      text: "No começo, o peão de `f7` só tem um defensor: o rei. O **mate pastor** junta a dama e o bispo contra ele.",
      board: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", marks: { f7: "focus", f2: "soft" } },
    },
    {
      kind: "tap",
      key: "ponto-fraco",
      prompt: "Toque na casa mais fraca das pretas no começo da partida.",
      board: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
      targets: ["f7"],
      wrong: (t) => `\`${t}\` está bem protegida. Procure o peão que só o rei defende.`,
      success: "`f7` (e `f2`, do lado das brancas) é o alvo favorito dos ataques rápidos.",
      reveal: { f7: "hint" },
      mistakeNote: "Casa fraca f7",
    },
    {
      kind: "tap",
      key: "defensor-f7",
      prompt: "Toque na única peça preta que defende `f7`.",
      board: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", marks: { f7: "focus" } },
      targets: ["e8"],
      wrong: (t) => `A peça em \`${t}\` não alcança \`f7\`. Olhe quem está do lado dele.`,
      success: "Só o rei. E o rei não pode capturar uma peça protegida, então dama mais bispo ganham a briga.",
      reveal: { e8: "hint" },
      mistakeNote: "Quem defende f7",
    },
    {
      kind: "sequence",
      key: "pastor-brancas",
      prompt: "Jogue o mate pastor com as brancas. As pretas vão errar no caminho.",
      board: { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" },
      line: ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"],
      anyMateAtEnd: true,
      comments: [
        "Abre caminho para a dama e o bispo.",
        "O bispo mira `f7`.",
        "A dama também mira `f7`.",
        "Mate! As pretas esqueceram de defender `f7`.",
      ],
      wrong: (_m, i) =>
        [
          "Comece com `e4` (peão para e4): abre a diagonal do bispo e da dama.",
          "Leve o bispo para `c4` (`Bc4`), mirando `f7`.",
          "Traga a dama para `h5` (`Qh5`), atacando `f7`.",
          "Capture em `f7` com a dama: `Qxf7#`.",
        ][i] ?? "Siga o plano: dama e bispo contra `f7`.",
      success: "Esse mate só funciona se o adversário esquece de defender `f7`.",
      mistakeNote: "Mate pastor",
    },
    {
      kind: "explain",
      title: "A defesa",
      text: "Não precisa ter medo desse ataque. Defenda `f7` e aproveite que a dama saiu cedo:",
      steps: [
        "Jogue `e5` e `Nc6`: centro e peça nova no jogo.",
        "Contra `Qh5`, o peão em `g6` expulsa a dama.",
        "Contra `Qf3`, o cavalo em `f6` fecha o caminho até `f7`.",
        "Cada fuga da dama é um lance a mais para você desenvolver.",
      ],
      board: { fen: "r1bqkbnr/pppp1p1p/2n3p1/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4", arrows: [{ from: "g6", to: "h5", tone: "good" }] },
    },
    ...PASTOR_DEFENSE.map(({ fen, solution }) => ({
      kind: "move" as const,
      key: `defesa-pastor:${fen}`,
      prompt: "As brancas ameaçam o mate pastor. Faça um lance que evite o mate.",
      board: boardFor(fen),
      accept: (_m: unknown, after: { fen: () => string }) => mateMoves(after.fen()).length === 0,
      solution,
      wrong: (m: { san: string; from: string; to: string }) => {
        const g = load(fen);
        g.move({ from: m.from, to: m.to });
        const mate = mateMoves(g.fen())[0];
        return `Depois de \`${m.san}\`, as brancas jogam \`${mate.san}\` e é mate. Proteja \`f7\` ou bloqueie o caminho da dama.`;
      },
      success: "Mate evitado. Agora é a dama das brancas que pode virar alvo.",
      mistakeNote: "Defender o mate pastor",
    })),
    {
      kind: "sequence",
      key: "pastor-pretas",
      prompt: "Agora você é as pretas e as brancas tentam o mate pastor. Defenda até o fim.",
      board: { fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", orientation: "black", lastMove: ["e2", "e4"] },
      line: ["e7e5", "f1c4", "b8c6", "d1h5", "g7g6", "h5f3", "g8f6"],
      comments: ["Centro.", "Defende `e5` e entra no jogo.", "Expulsa a dama.", "A dama mira `f7` de novo, e o cavalo fecha o caminho. Sua posição é melhor."],
      wrong: (_m, i) =>
        [
          "Comece pelo centro: `e5`.",
          "O bispo mira `f7`, mas ainda não há ameaça. Desenvolva o cavalo em `c6`, que também defende `e5`.",
          "Dama em `h5` e bispo em `c4` ameaçam mate em `f7`. Expulse a dama com `g6`.",
          "A dama voltou para `f3`, mirando `f7` de novo. Coloque o cavalo em `f6`.",
        ][i] ?? "Defenda `f7`.",
      success: "Mate evitado, e as brancas gastaram três lances com a dama.",
      mistakeNote: "Defender o mate pastor",
    },
  ],
};
