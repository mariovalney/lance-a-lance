import type { LessonDef, Screen, MarkKind } from "@/content/types";
import {
  ALL_SQUARES,
  FILES,
  RANKS,
  fileIndex,
  fileOf,
  rankOf,
  squaresOfFile,
  squaresOfRank,
  toSquare,
  type Square,
} from "@/lib/chess/squares";
import { pickDistinct, shuffle } from "@/lib/random";

function marksFor(squares: Square[], kind: MarkKind): Partial<Record<Square, MarkKind>> {
  return Object.fromEntries(squares.map((s) => [s, kind]));
}

function fileRounds(n: number): Screen[] {
  return pickDistinct(FILES, n).map((f) => ({
    kind: "tap",
    key: `coluna:${f}`,
    prompt: `Toque em qualquer casa da coluna \`${f}\`.`,
    board: {},
    targets: squaresOfFile(f),
    wrong: (t) =>
      `Essa casa é da coluna \`${fileOf(t)}\`. Procure a letra \`${f}\` na borda de baixo e toque em qualquer casa acima dela.`,
    success: `Isso! Tudo acima da letra \`${f}\` é a coluna \`${f}\`.`,
    reveal: marksFor(squaresOfFile(f), "hint") as Partial<Record<Square, "hint">>,
    mistakeNote: `Coluna \`${f}\``,
  }));
}

function rankRounds(n: number): Screen[] {
  return pickDistinct(RANKS, n).map((r) => ({
    kind: "tap",
    key: `fileira:${r}`,
    prompt: `Toque em qualquer casa da fileira \`${r}\`.`,
    board: {},
    targets: squaresOfRank(r),
    wrong: (t) =>
      `Essa casa é da fileira \`${rankOf(t)}\`. Os números ficam na borda da esquerda: ache o \`${r}\` e siga para o lado.`,
    success: `Boa! A fileira \`${r}\` atravessa o tabuleiro de lado a lado.`,
    reveal: marksFor(squaresOfRank(r), "hint") as Partial<Record<Square, "hint">>,
    mistakeNote: `Fileira \`${r}\``,
  }));
}

function squareRounds(n: number, avoid: Square[] = []): Screen[] {
  return pickDistinct(ALL_SQUARES, n, avoid).map((sq) => {
    const f = fileOf(sq);
    const r = rankOf(sq);
    const reveal: Partial<Record<Square, "soft" | "hint">> = {
      ...(marksFor(squaresOfFile(f), "soft") as Partial<Record<Square, "soft">>),
      ...(marksFor(squaresOfRank(r), "soft") as Partial<Record<Square, "soft">>),
      [sq]: "hint",
    };
    return {
      kind: "tap",
      key: `casa:${sq}`,
      prompt: `Toque na casa \`${sq}\`.`,
      board: {},
      targets: [sq],
      wrong: (t: Square) =>
        `Você tocou em \`${t}\`. Ache a coluna \`${f}\` e suba até a fileira \`${r}\`.`,
      success: `Certo, essa é a \`${sq}\`.`,
      reveal,
      mistakeNote: `Casa \`${sq}\``,
    } satisfies Screen;
  });
}

/** Wrong answers that mirror the usual confusions. */
function distractors(sq: Square): Square[] {
  const fi = fileIndex(sq);
  const r = rankOf(sq);
  const candidates: (Square | null)[] = [
    toSquare(7 - fi, r), // mirrored file (reading the board from the other side)
    toSquare(fi, 9 - r), // mirrored rank
    toSquare(fi + 1, r),
    toSquare(fi - 1, r),
    toSquare(fi, r + 1),
    toSquare(fi, r - 1),
  ];
  const unique = [...new Set(candidates.filter((c): c is Square => !!c && c !== sq))];
  return shuffle(unique).slice(0, 3);
}

function nameRounds(n: number): Screen[] {
  return pickDistinct(ALL_SQUARES, n).map((sq) => {
    const options = shuffle([sq, ...distractors(sq)]).map((s) => ({ id: s, label: s, mono: true }));
    return {
      kind: "choice",
      key: `nome:${sq}`,
      prompt: "Qual é o nome da casa marcada?",
      board: { marks: { [sq]: "focus" } },
      revealBoard: { marks: { [sq]: "good" }, labels: { [sq]: sq } },
      options,
      correct: sq,
      explain: `É a \`${sq}\`: coluna \`${fileOf(sq)}\`, fileira \`${rankOf(sq)}\`.`,
      mistakeNote: `Nome da casa \`${sq}\``,
    } satisfies Screen;
  });
}

export const lessonCoordenadas: LessonDef = {
  id: "m1-l1",
  title: "Colunas, fileiras e casas",
  summary: "Como achar qualquer casa do tabuleiro pelo nome.",
  minutes: 3,
  build: () => {
    const squares = squareRounds(4);
    return [
      {
        kind: "explain",
        title: "Colunas",
        text: "As **colunas** são as linhas em pé. Cada uma tem uma letra, de `a` até `h`, escrita na borda de baixo.",
        board: {
          marks: marksFor(squaresOfFile("e"), "soft"),
          arrows: [{ from: "e1", to: "e8" }],
        },
      },
      ...fileRounds(3),
      {
        kind: "explain",
        title: "Fileiras",
        text: "As **fileiras** são as linhas deitadas. Elas têm números de `1` a `8`, contando a partir do lado das brancas.",
        board: {
          marks: marksFor(squaresOfRank(4), "soft"),
          arrows: [{ from: "a4", to: "h4" }],
        },
      },
      ...rankRounds(3),
      {
        kind: "explain",
        title: "O nome de cada casa",
        text: "Cada casa tem um nome: a letra da coluna e depois o número da fileira. A coluna `e` cruza a fileira `4` na casa `e4`.",
        board: {
          marks: {
            ...marksFor(squaresOfFile("e"), "soft"),
            ...marksFor(squaresOfRank(4), "soft"),
            e4: "focus",
          },
          labels: { e4: "e4" },
        },
        tip: "Primeiro a letra, depois o número. Sempre.",
      },
      ...squares,
      {
        kind: "explain",
        title: "Agora ao contrário",
        text: "Você já acha uma casa pelo nome. Agora olhe a casa marcada e diga o nome dela.",
        board: { marks: { c6: "focus" }, labels: { c6: "c6" } },
      },
      ...nameRounds(3),
    ];
  },
};
