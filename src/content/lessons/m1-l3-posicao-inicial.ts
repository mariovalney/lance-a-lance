import type { LessonDef, MarkKind, Screen } from "@/content/types";
import { ALL_SQUARES, START_FEN, squaresOfRank, type Square } from "@/lib/chess/squares";
import { parsePlacement, pieceName, pieceWithColor, type PieceChar } from "@/lib/chess/fen";
import { pick, pickDistinct, shuffle } from "@/lib/random";

const START = parsePlacement(START_FEN);
const BACK_RANK_SQUARES = [...squaresOfRank(1), ...squaresOfRank(8)];

const ARTICLE: Record<string, string> = { rei: "o", dama: "a", torre: "a", bispo: "o", cavalo: "o", peão: "o" };
const INDEF: Record<string, string> = { rei: "o", dama: "a", torre: "uma", bispo: "um", cavalo: "um", peão: "um" };
const FACT: Record<string, string> = {
  rei: "a peça mais importante: se ele levar xeque-mate, o jogo acaba.",
  dama: "a peça mais forte do jogo.",
  torre: "ela começa nos cantos.",
  bispo: "ele começa ao lado do rei e da dama.",
  cavalo: "ele começa entre a torre e o bispo.",
  peão: "são oito na frente de cada lado.",
};
const NAMES = ["rei", "dama", "torre", "bispo", "cavalo", "peão"];

function cap(s: string) {
  return s[0].toUpperCase() + s.slice(1);
}

function squaresWith(piece: PieceChar): Square[] {
  return ALL_SQUARES.filter((sq) => START.get(sq) === piece);
}

function marksFor(squares: Square[], kind: MarkKind): Partial<Record<Square, MarkKind>> {
  return Object.fromEntries(squares.map((s) => [s, kind]));
}

function nameOptions(correct: string) {
  const others = pickDistinct(NAMES.filter((n) => n !== correct), 3);
  return shuffle([correct, ...others]).map((n) => ({ id: n, label: cap(n) }));
}

function whatPieceRounds(n: number): Screen[] {
  const squares = pickDistinct(BACK_RANK_SQUARES, n - 1);
  squares.push(pick([...squaresOfRank(2), ...squaresOfRank(7)]));
  return shuffle(squares).map((sq) => {
    const name = pieceName(START.get(sq)!);
    return {
      kind: "choice",
      key: `que-peca:${sq}`,
      prompt: "Que peça é esta?",
      board: { fen: START_FEN, marks: { [sq]: "focus" } },
      revealBoard: { fen: START_FEN, marks: { [sq]: "good" } },
      options: nameOptions(name),
      correct: name,
      explain: `É ${ARTICLE[name]} ${name}: ${FACT[name]}`,
      mistakeNote: `Reconhecer ${ARTICLE[name]} ${name}`,
    } satisfies Screen;
  });
}

function whereRounds(pieces: PieceChar[]): Screen[] {
  return pieces.map((piece) => {
    const targets = squaresWith(piece);
    const label = pieceWithColor(piece);
    const name = pieceName(piece);
    const many = targets.length > 1;
    return {
      kind: "tap",
      key: `onde:${piece}`,
      prompt: many ? `Toque em uma casa onde começa ${INDEF[name]} ${label}.` : `Toque na casa onde começa ${ARTICLE[name]} ${label}.`,
      board: {},
      targets,
      wrong: (t: Square) => {
        const there = START.get(t);
        return there
          ? `Em \`${t}\` começa ${ARTICLE[pieceName(there)]} ${pieceWithColor(there)}. Procure ${many ? `${INDEF[name]} ${label}` : `${ARTICLE[name]} ${label}`}.`
          : `A casa \`${t}\` começa vazia. As peças começam nas fileiras \`1\`, \`2\`, \`7\` e \`8\`.`;
      },
      success: many
        ? `Isso. ${cap(ARTICLE[name] === "a" ? "as" : "os")} ${label.split(" ").map((w) => w + "s").join(" ")} começam em ${targets.map((s) => `\`${s}\``).join(" e ")}.`
        : `Isso, ${ARTICLE[name]} ${label} começa em \`${targets[0]}\`.`,
      reveal: marksFor(targets, "hint") as Partial<Record<Square, "hint">>,
      mistakeNote: `Onde começa ${ARTICLE[name]} ${label}`,
    } satisfies Screen;
  });
}

function whichOnSquareRounds(n: number): Screen[] {
  return pickDistinct(BACK_RANK_SQUARES, n).map((sq) => {
    const piece = START.get(sq)!;
    const name = pieceName(piece);
    return {
      kind: "choice",
      key: `qual-em:${sq}`,
      prompt: `Sem olhar: qual peça começa em \`${sq}\`?`,
      hideBoardUntilAnswered: true,
      revealBoard: { fen: START_FEN, marks: { [sq]: "ring" }, labels: { [sq]: sq } },
      options: nameOptions(name),
      correct: name,
      explain: `Em \`${sq}\` começa ${ARTICLE[name]} ${pieceWithColor(piece)}.`,
      mistakeNote: `Peça que começa em \`${sq}\``,
    } satisfies Screen;
  });
}

const WRONG_SETUPS: { fen: string; why: string }[] = [
  {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBKQBNR w - - 0 1",
    why: "Errado: o rei e a dama brancos trocaram de lugar. A dama branca fica na casa clara `d1`.",
  },
  {
    fen: "rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1",
    why: "Errado: o rei e a dama pretos trocaram de lugar. A dama preta fica na casa escura `d8`.",
  },
  {
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RBNQKNBR w - - 0 1",
    why: "Errado: cavalos e bispos brancos trocaram de lugar. O cavalo fica ao lado da torre.",
  },
  {
    fen: "rbnqknbr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1",
    why: "Errado: cavalos e bispos pretos trocaram de lugar. O cavalo fica ao lado da torre.",
  },
];

function setupRounds(): Screen[] {
  const wrong = pick(WRONG_SETUPS);
  return shuffle([null, wrong]).map((w, i) => ({
    kind: "choice",
    key: `montagem-pecas:${w ? "errada" : "certa"}`,
    prompt: "As peças estão no lugar certo?",
    board: { fen: w ? w.fen : START_FEN },
    options: [
      { id: "certo", label: "Está certo" },
      { id: "errado", label: "Está errado" },
    ],
    correct: w ? "errado" : "certo",
    explain: w ? w.why : "Certo: torres nos cantos, depois cavalos e bispos, e a dama na casa da sua cor.",
    mistakeNote: `Conferir a posição inicial (${i + 1})`,
  }));
}

export const lessonPosicaoInicial: LessonDef = {
  id: "m1-l3",
  title: "A posição inicial",
  summary: "Onde cada peça começa e como conferir se o tabuleiro está montado certo.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "As peças",
      text: "Cada lado começa com 16 peças: 8 **peões** na frente e, atrás, torres, cavalos, bispos, a **dama** e o **rei**.",
      board: { fen: START_FEN },
    },
    ...whatPieceRounds(3),
    {
      kind: "explain",
      title: "Do canto para o meio",
      text: "Na fileira de trás, saindo do canto: **torre**, **cavalo** e **bispo**. Os dois lados são iguais, como um espelho.",
      board: {
        fen: START_FEN,
        marks: { a1: "ring", h1: "ring", b1: "soft", g1: "soft", c1: "focus", f1: "focus" },
        arrows: [
          { from: "a1", to: "c1" },
          { from: "h1", to: "f1" },
        ],
      },
    },
    ...whereRounds(pickDistinct(["R", "N", "B", "r", "n", "b"] as PieceChar[], 3)),
    {
      kind: "explain",
      title: "A dama gosta da sua cor",
      text: "A dama branca começa na casa clara `d1`. A dama preta, na casa escura `d8`. O rei fica ao lado dela.",
      board: { fen: START_FEN, marks: { d1: "ring", d8: "ring", e1: "soft", e8: "soft" } },
      tip: "Se a dama não estiver na casa da própria cor, rei e dama estão trocados.",
    },
    ...whereRounds(pickDistinct(["Q", "q", "K", "k"] as PieceChar[], 2)),
    ...whichOnSquareRounds(2),
    {
      kind: "explain",
      title: "Confira antes de jogar",
      text: "Antes de começar, olhe três coisas: casa clara à direita, torres nos cantos e dama na casa da sua cor.",
      board: { fen: START_FEN, marks: { h1: "ring", a8: "ring", d1: "focus", d8: "focus" } },
    },
    ...setupRounds(),
  ],
};
