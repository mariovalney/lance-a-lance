import type { LessonDef, Screen } from "@/content/types";
import MATES from "@/content/data/mates.json";
import { MATE_IN_ONE_POOL } from "@/content/lessons/m3-l3-xeque-mate";
import { boardFor, isLegalPosition, mateMoves, placementToFen, randomVariant } from "@/content/lib/positions";
import { legalMoves, load, uciOf } from "@/lib/chess/game";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";
import { pick, pickDistinct, shuffle } from "@/lib/random";

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
      success: "Técnica limpa!",
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
      success: "Você venceu o final do começo ao fim.",
      mistakeNote: key,
    };
  }
  throw new Error("could not build full game");
}

/* ---------- 5.1 mate em 1 ---------- */

export const lessonMateEm1: LessonDef = {
  id: "m5-l1",
  title: "Mate em 1",
  summary: "Ache o lance que termina a partida.",
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "Como achar o mate",
      text: "Olhe primeiro os lances que dão **xeque**. Para cada um, pergunte: o rei foge? alguém bloqueia? alguém captura quem ataca? Se as três respostas forem não, é mate.",
      board: { fen: "6k1/5ppp/8/8/8/8/8/4R1K1 w - - 0 1", arrows: [{ from: "e1", to: "e8" }] },
    },
    ...mateInOne(MATE_IN_ONE_POOL.filter((p) => p.transform !== false).map((p) => p.fen), 3, "m1-padrao"),
    {
      kind: "explain",
      title: "O rei ajuda",
      text: "No fim da partida, a dama ou a torre sozinhas não dão mate: o seu rei precisa ficar perto e tirar as casas de fuga.",
      board: { fen: "4k3/4Q3/4K3/8/8/8/8/8 b - - 0 1", marks: { e8: "bad", d8: "soft", f8: "soft", d7: "soft", f7: "soft" } },
    },
    ...mateInOne([...MATES.kq1, ...MATES.kr1, ...MATES.krr1], 3, "m1-final"),
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

export const lessonCorredor: LessonDef = {
  id: "m5-l2",
  title: "Mate do corredor",
  summary: "O rei preso pelos próprios peões na última fileira.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "O corredor",
      text: "Quando o rei está na última fileira com os peões na frente, uma torre ou dama que chega nessa fileira dá mate. Os peões dele viram a prisão.",
      board: { fen: "3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1", marks: { g8: "bad", f7: "soft", g7: "soft", h7: "soft" } },
    },
    ...mateInOne(BACK_RANK, 3, "corredor"),
    {
      kind: "explain",
      title: "A janela",
      text: "Para não levar esse mate, dê ao rei uma casa de fuga: avance um peão da frente dele (como `h3`) quando tiver tempo.",
      board: { fen: "6k1/5pp1/7p/8/8/7P/5PP1/6K1 w - - 0 1", marks: { h2: "good", h7: "good" } },
    },
    ...defenseRounds(2),
  ],
};

/* ---------- 5.3 dama e rei ---------- */

export const lessonDamaRei: LessonDef = {
  id: "m5-l3",
  title: "Dama e rei contra rei",
  summary: "Prenda o rei com a dama e traga o seu rei para o mate.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "A caixa",
      text: "Use a dama para prender o rei adversário numa **caixa** cada vez menor, ficando a um salto de cavalo dele. Quando ele estiver na borda, traga o seu rei para ajudar.",
      board: { fen: "8/8/3k4/8/2Q5/8/8/4K3 w - - 0 1", arrows: [{ from: "c4", to: "c5" }], marks: { d6: "focus" } },
    },
    ...mateInOne(MATES.kq1, 2, "kq1"),
    {
      kind: "explain",
      title: "Cuidado com o afogamento",
      text: "Com o rei adversário no canto, antes de encostar a dama confira: ele ainda tem algum lance? Se não tiver e não for xeque, é empate.",
      board: { fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1", marks: { h8: "bad" } },
    },
    ...mateInTwo("kq2", 2, "kq2", "Prenda o rei antes de dar xeque."),
    fullGame(["Q"], 16, "Dama e rei do começo", "Dama a um salto de cavalo do rei, depois traga o seu rei.", "Agora do começo: dê mate com dama e rei."),
  ],
};

/* ---------- 5.4 duas torres ---------- */

export const lessonDuasTorres: LessonDef = {
  id: "m5-l4",
  title: "Duas torres contra rei",
  summary: "O mate da escada: uma torre prende, a outra dá xeque.",
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "A escada",
      text: "Uma torre fecha uma fileira, a outra dá xeque na seguinte. O rei vai sendo empurrado degrau por degrau até a borda.",
      board: {
        fen: "8/8/8/3k4/R7/1R6/8/6K1 w - - 0 1",
        arrows: [
          { from: "a4", to: "h4", tone: "hint" },
          { from: "b3", to: "b5" },
        ],
      },
      tip: "Se o rei chegar perto de uma torre, leve essa torre para o outro lado do tabuleiro.",
    },
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
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "Torre corta, rei empurra",
      text: "A torre **corta** o rei adversário, prendendo-o de um lado do tabuleiro. O seu rei se aproxima de frente para ele. Com o rei dele na borda e o seu na frente, a torre dá o mate.",
      board: { fen: "4k3/8/4K3/8/8/8/8/R7 w - - 0 1", arrows: [{ from: "a1", to: "a8" }], marks: { e8: "focus" } },
      tip: "Os reis frente a frente, com uma casa entre eles, é a chamada oposição.",
    },
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
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "O ponto fraco",
      text: "No começo, o peão de `f7` só é defendido pelo rei. O **mate pastor** junta dama e bispo contra ele.",
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
      success: "Esse mate só funciona se o adversário não defender. Agora veja como se defender.",
      mistakeNote: "Mate pastor",
    },
    {
      kind: "explain",
      title: "A defesa",
      text: "Quando a dama e o bispo miram `f7`, proteja o peão ou bloqueie o caminho. Contra `Qh5`, `g6` ataca a dama. Contra `Qf3`, `Nf6` fecha a linha.",
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
  ],
};
