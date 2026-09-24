import type { LessonDef, MarkKind, Screen } from "@/content/types";
import {
  ALL_SQUARES,
  START_FEN,
  fileIndex,
  fileOf,
  rankOf,
  squaresOfFile,
  squaresOfRank,
  toSquare,
  type Square,
} from "@/lib/chess/squares";
import { pickDistinct, shuffle } from "@/lib/random";

type Side = "white" | "black";

function marksFor(squares: Square[], kind: MarkKind): Partial<Record<Square, MarkKind>> {
  return Object.fromEntries(squares.map((s) => [s, kind]));
}

function sideLabel(side: Side) {
  return side === "white" ? "brancas" : "pretas";
}

function tapRounds(sides: Side[]): Screen[] {
  const squares = pickDistinct(ALL_SQUARES, sides.length);
  return sides.map((side, i) => {
    const sq = squares[i];
    const f = fileOf(sq);
    const r = rankOf(sq);
    const reveal: Partial<Record<Square, "soft" | "hint">> = {
      ...(marksFor(squaresOfFile(f), "soft") as Partial<Record<Square, "soft">>),
      ...(marksFor(squaresOfRank(r), "soft") as Partial<Record<Square, "soft">>),
      [sq]: "hint",
    };
    return {
      kind: "tap",
      key: `virado:${side}:${sq}`,
      prompt: `De ${sideLabel(side)}: toque na casa \`${sq}\`.`,
      board: { orientation: side },
      targets: [sq],
      wrong: (t: Square) =>
        side === "black"
          ? `Você tocou em \`${t}\`. De pretas, as letras vão de \`h\` a \`a\` e o \`1\` fica lá em cima. Ache a coluna \`${f}\` e a fileira \`${r}\`.`
          : `Você tocou em \`${t}\`. Ache a coluna \`${f}\` e suba até a fileira \`${r}\`.`,
      success: `Certo, essa é a \`${sq}\`.`,
      reveal,
      mistakeNote: `Casa \`${sq}\` de ${sideLabel(side)}`,
    } satisfies Screen;
  });
}

/** Wrong answers include the "read it as if I were White" mistake. */
function flippedDistractors(sq: Square): Square[] {
  const fi = fileIndex(sq);
  const r = rankOf(sq);
  const candidates: (Square | null)[] = [
    toSquare(7 - fi, 9 - r), // the same spot read from the other side
    toSquare(7 - fi, r),
    toSquare(fi, 9 - r),
    toSquare(fi + 1, r),
    toSquare(fi - 1, r),
  ];
  const unique = [...new Set(candidates.filter((c): c is Square => !!c && c !== sq))];
  return [unique[0], ...shuffle(unique.slice(1)).slice(0, 2)];
}

function nameRounds(n: number): Screen[] {
  return pickDistinct(ALL_SQUARES, n).map((sq) => ({
    kind: "choice",
    key: `nome-virado:${sq}`,
    prompt: "De pretas: qual é o nome da casa marcada?",
    board: { orientation: "black", marks: { [sq]: "focus" } },
    revealBoard: { orientation: "black", marks: { [sq]: "good" }, labels: { [sq]: sq } },
    options: shuffle([sq, ...flippedDistractors(sq)]).map((s) => ({ id: s, label: s, mono: true })),
    correct: sq,
    explain: `É a \`${sq}\`. Com o tabuleiro virado, a coluna \`${fileOf(sq)}\` e a fileira \`${rankOf(sq)}\` continuam onde as letras e números indicam.`,
    mistakeNote: `Nome da casa \`${sq}\` de pretas`,
  }));
}

export const lessonJogandoDePretas: LessonDef = {
  id: "m1-l4",
  title: "Jogando de pretas",
  summary: "No chess.com o tabuleiro vira quando você joga de pretas. Ache casas nos dois lados.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "O tabuleiro vira",
      text: "Quando você joga de pretas, suas peças ficam embaixo. As letras passam a ir de `h` a `a`, e a fileira `8` fica perto de você.",
      board: { fen: START_FEN, orientation: "black", marks: { a1: "ring", h8: "ring" }, labels: { a1: "a1", h8: "h8" } },
      tip: "A casa clara continua no seu canto direito: agora é a `a8`.",
    },
    ...tapRounds(["black", "black", "black"]),
    {
      kind: "explain",
      title: "O nome não muda",
      text: "A `e4` é sempre a mesma casa. O que muda é o seu ponto de vista: de pretas, ela fica do outro lado.",
      board: { orientation: "black", marks: { e4: "focus" }, labels: { e4: "e4" } },
    },
    ...nameRounds(3),
    {
      kind: "explain",
      title: "Agora misturado",
      text: "No chess.com cada partida pode ser de um lado. Leia o lado antes de procurar a casa.",
      board: { orientation: "white", marks: { e4: "focus" }, labels: { e4: "e4" } },
    },
    ...tapRounds(shuffle<Side>(["white", "black", "white", "black"])),
  ],
};
