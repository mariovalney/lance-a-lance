import type { LessonDef, MarkKind, Screen } from "@/content/types";
import {
  ALL_SQUARES,
  diagonalBetween,
  fileIndex,
  isLight,
  rankOf,
  ray,
  sameDiagonal,
  type Square,
} from "@/lib/chess/squares";
import { pick, pickDistinct, shuffle } from "@/lib/random";

function marksFor(squares: Square[], kind: MarkKind): Partial<Record<Square, MarkKind>> {
  return Object.fromEntries(squares.map((s) => [s, kind]));
}

function orientationRounds(): Screen[] {
  return shuffle([false, true]).map((swapped, i) => ({
    kind: "choice",
    key: `montagem:${swapped ? "errada" : "certa"}`,
    prompt: "Este tabuleiro está montado do jeito certo?",
    board: { swapColors: swapped, coordinates: false, marks: { h1: "ring" } },
    options: [
      { id: "certo", label: "Está certo" },
      { id: "errado", label: "Está errado" },
    ],
    correct: swapped ? "errado" : "certo",
    explain: swapped
      ? "Errado: o canto de baixo à direita está escuro. Basta girar o tabuleiro um quarto de volta."
      : "Certo: o canto de baixo à direita é uma casa clara.",
    mistakeNote: `Montagem do tabuleiro (${i + 1})`,
  }));
}

function colorRounds(n: number): Screen[] {
  // Mix of light and dark squares.
  const light = pickDistinct(ALL_SQUARES.filter(isLight), Math.ceil(n / 2));
  const dark = pickDistinct(ALL_SQUARES.filter((s) => !isLight(s)), Math.floor(n / 2));
  return shuffle([...light, ...dark]).map((sq) => {
    const lightSq = isLight(sq);
    const f = fileIndex(sq) + 1;
    const r = rankOf(sq);
    const sum = f + r;
    return {
      kind: "choice",
      key: `cor:${sq}`,
      prompt: `Sem olhar: a casa \`${sq}\` é clara ou escura?`,
      hideBoardUntilAnswered: true,
      revealBoard: { marks: { [sq]: "ring" }, labels: { [sq]: sq } },
      options: [
        { id: "clara", label: "Clara" },
        { id: "escura", label: "Escura" },
      ],
      correct: lightSq ? "clara" : "escura",
      explain: `\`${sq}\` é ${lightSq ? "clara" : "escura"}: ${sq[0]} = ${f}, e ${f} + ${r} = ${sum}, que é ${
        sum % 2 === 0 ? "par (escura)" : "ímpar (clara)"
      }.`,
      mistakeNote: `Cor da casa \`${sq}\``,
    } satisfies Screen;
  });
}

const DIRECTIONS: [number, number][] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/** A random diagonal segment with 5 or 6 squares. */
function randomSegment(): Square[] {
  for (;;) {
    const start = pick(ALL_SQUARES);
    const [df, dr] = pick(DIRECTIONS);
    const full = ray(start, df, dr);
    const len = pick([5, 6]);
    if (full.length >= len) return full.slice(0, len);
  }
}

function completeRounds(n: number): Screen[] {
  const used = new Set<string>();
  const out: Screen[] = [];
  while (out.length < n) {
    const seg = randomSegment();
    const id = [seg[0], seg[seg.length - 1]].sort().join("-");
    if (used.has(id)) continue;
    used.add(id);
    const a = seg[0];
    const b = seg[seg.length - 1];
    const inner = seg.slice(1, -1);
    out.push({
      kind: "tapAll",
      key: `diagonal:${a}-${b}`,
      prompt: `Complete a diagonal de \`${a}\` até \`${b}\`: toque nas ${inner.length} casas do meio.`,
      board: { marks: { [a]: "focus", [b]: "focus" } },
      targets: inner,
      wrong: (t) =>
        `\`${t}\` fica fora dessa diagonal. Saia de \`${a}\` andando uma casa para o lado e uma para ${
          rankOf(b) > rankOf(a) ? "cima" : "baixo"
        } ao mesmo tempo.`,
      success: `Diagonal completa: todas as casas têm a mesma cor.`,
      mistakeNote: `Diagonal \`${a}\` até \`${b}\``,
    });
  }
  return out;
}

function sameDiagonalRounds(n: number): Screen[] {
  const out: Screen[] = [];
  const answers = shuffle([true, false, ...(n > 2 ? [Math.random() < 0.5] : [])]).slice(0, n);
  for (const yes of answers) {
    let a: Square;
    let b: Square;
    if (yes) {
      do {
        a = pick(ALL_SQUARES);
        b = pick(ALL_SQUARES);
      } while (!sameDiagonal(a, b) || Math.abs(fileIndex(a) - fileIndex(b)) < 2);
    } else {
      // Same color but not on one diagonal: the tricky case.
      do {
        a = pick(ALL_SQUARES);
        b = pick(ALL_SQUARES);
      } while (a === b || sameDiagonal(a, b) || isLight(a) !== isLight(b) || fileIndex(a) === fileIndex(b) || rankOf(a) === rankOf(b));
    }
    const line = yes ? diagonalBetween(a, b)! : [];
    out.push({
      kind: "choice",
      key: `mesma-diagonal:${a}-${b}`,
      prompt: `As casas \`${a}\` e \`${b}\` estão na mesma diagonal?`,
      board: { marks: { [a]: "focus", [b]: "focus" } },
      revealBoard: yes
        ? { marks: { ...marksFor(line, "soft"), [a]: "good", [b]: "good" }, arrows: [{ from: a, to: b, tone: "good" }] }
        : { marks: { [a]: "focus", [b]: "focus" } },
      options: [
        { id: "sim", label: "Sim" },
        { id: "nao", label: "Não" },
      ],
      correct: yes ? "sim" : "nao",
      explain: yes
        ? `Sim: de \`${a}\` a \`${b}\` você anda o mesmo número de casas para o lado e na vertical.`
        : `Não. As duas têm a mesma cor, mas nenhuma linha inclinada liga uma à outra.`,
      mistakeNote: `Mesma diagonal? \`${a}\` e \`${b}\``,
    });
  }
  return out;
}

const LONG_A1H8 = ray("a1", 1, 1);
const LONG_H1A8 = ray("h1", -1, 1);

export const lessonCoresDiagonais: LessonDef = {
  id: "m1-l2",
  title: "Cores e diagonais",
  summary: "Casa clara à direita, a cor de cada casa e as linhas inclinadas.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Casa clara à direita",
      text: "As casas se alternam entre claras e escuras. Monte o tabuleiro sempre com uma **casa clara no canto direito** de cada jogador.",
      board: { marks: { h1: "ring", a8: "ring" } },
      tip: "É uma regra oficial da FIDE. Se o canto da direita estiver escuro, gire o tabuleiro.",
    },
    ...orientationRounds(),
    {
      kind: "explain",
      title: "A cor de cada casa",
      text: "A casa `a1` é escura. Dê um passo para o lado ou para cima e a cor troca.",
      board: {
        marks: { a1: "ring", b1: "ring", a2: "ring" },
        labels: { a1: "a1" },
        arrows: [
          { from: "a1", to: "b1" },
          { from: "a1", to: "a2" },
        ],
      },
      tip: "Truque: troque a letra por número (a = 1, b = 2...) e some com a fileira. Soma par é escura, soma ímpar é clara.",
    },
    ...colorRounds(3),
    {
      kind: "explain",
      title: "Diagonais",
      text: "Uma **diagonal** é uma linha inclinada de casas. Todas as casas de uma diagonal têm a mesma cor.",
      board: {
        marks: marksFor(diagonalBetween("c1", "h6")!, "soft"),
        arrows: [{ from: "c1", to: "h6" }],
      },
    },
    ...completeRounds(2),
    {
      kind: "explain",
      title: "As duas grandes diagonais",
      text: "As maiores diagonais têm 8 casas: de `a1` a `h8` e de `h1` a `a8`. Elas se cruzam bem no centro.",
      board: {
        marks: { ...marksFor(LONG_A1H8, "soft"), ...marksFor(LONG_H1A8, "soft") },
        arrows: [
          { from: "a1", to: "h8" },
          { from: "h1", to: "a8" },
        ],
      },
    },
    ...sameDiagonalRounds(3),
  ],
};
