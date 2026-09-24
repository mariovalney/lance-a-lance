import type { ChoiceScreen, LessonDef, Screen } from "@/content/types";
import { OPENINGS } from "@/content/lessons/m4-valor-notacao";
import { boardFor, isLegalPosition, withRandomKings } from "@/content/lib/positions";
import { parsePlacement, toFen, type PieceChar } from "@/lib/chess/fen";
import { legalMoves, uciOf } from "@/lib/chess/game";
import { readMove, withoutOrigin } from "@/lib/chess/notation";
import { ALL_SQUARES, fileIndex, rankOf, toSquare, type Square } from "@/lib/chess/squares";
import { pick, pickDistinct, shuffle } from "@/lib/random";

/* ---------- shared ---------- */

interface Item {
  id: string;
  answer: string;
  /** An easy-to-confuse partner, always offered as a wrong option. */
  twin?: string;
}

/** Choice with the right answer, its twin (if any) and random fillers: 3 options. */
function optionsFor(item: Item, all: Item[]): { id: string; label: string }[] {
  const twin = all.find((o) => o.id === item.twin);
  const pool = all.filter((o) => o.id !== item.id && o.id !== twin?.id).map((o) => o.answer);
  const fillers = pickDistinct(pool, twin ? 1 : 2);
  return shuffle([item.answer, ...(twin ? [twin.answer] : []), ...fillers]).map((a) => ({ id: a, label: a }));
}

/* ---------- 4.4 símbolos e avaliações ---------- */

const ANNOTATIONS: Item[] = [
  { id: "!!", answer: "Lance brilhante", twin: "??" },
  { id: "!", answer: "Bom lance", twin: "?" },
  { id: "!?", answer: "Lance interessante", twin: "?!" },
  { id: "?!", answer: "Lance duvidoso", twin: "!?" },
  { id: "?", answer: "Erro", twin: "!" },
  { id: "??", answer: "Erro grave", twin: "!!" },
];

const SAMPLE_SAN = ["Nf3", "Bc4", "Qh5", "e5", "Rxe7", "Bxf7+", "O-O", "d4"];

function annotationRounds(n: number): Screen[] {
  return pickDistinct(ANNOTATIONS, n).map(
    (it) =>
      ({
        kind: "choice",
        key: `anotacao:${it.id}`,
        prompt: `Num comentário de partida aparece \`${pick(SAMPLE_SAN)}${it.id}\`. O que \`${it.id}\` quer dizer?`,
        options: optionsFor(it, ANNOTATIONS),
        correct: it.answer,
        explain: `\`${it.id}\` é ${it.answer.toLowerCase()}. Ponto de exclamação elogia, ponto de interrogação critica.`,
        mistakeNote: `Sinal \`${it.id}\``,
      }) satisfies ChoiceScreen,
  );
}

const REVIEW: (Item & { scene: string })[] = [
  { id: "best", scene: "Você jogou exatamente o lance que o computador indica.", answer: "Best (melhor)" },
  { id: "book", scene: "Na abertura, você jogou um lance conhecido da teoria.", answer: "Book (teórico)" },
  { id: "miss", scene: "O adversário deixou a dama solta e você não capturou.", answer: "Miss (chance perdida)", twin: "blunder" },
  { id: "blunder", scene: "Você deixou sua dama ser capturada de graça.", answer: "Blunder (capivarada)", twin: "miss" },
  { id: "brilliant", scene: "Você sacrificou uma peça e o sacrifício era o melhor caminho.", answer: "Brilliant (brilhante)" },
  { id: "inaccuracy", scene: "Seu lance não perdeu material, mas deixou escapar um pouco da vantagem.", answer: "Inaccuracy (imprecisão)", twin: "blunder" },
];

function reviewRounds(n: number): Screen[] {
  return pickDistinct(REVIEW, n).map(
    (it) =>
      ({
        kind: "choice",
        key: `revisao:${it.id}`,
        prompt: `${it.scene} Como a revisão do chess.com chama esse lance?`,
        options: optionsFor(it, REVIEW),
        correct: it.answer,
        explain: `**${it.answer}**.`,
        mistakeNote: `Revisão: ${it.answer}`,
      }) satisfies ChoiceScreen,
  );
}

const EVALS: Item[] = [
  { id: "+1.0", answer: "Vantagem das brancas, cerca de um peão", twin: "-1.0" },
  { id: "-1.0", answer: "Vantagem das pretas, cerca de um peão", twin: "+1.0" },
  { id: "+3.0", answer: "Vantagem das brancas, cerca de um cavalo ou bispo", twin: "-3.0" },
  { id: "-3.0", answer: "Vantagem das pretas, cerca de um cavalo ou bispo", twin: "+3.0" },
  { id: "+5.0", answer: "Vantagem das brancas, cerca de uma torre", twin: "-5.0" },
  { id: "-5.0", answer: "Vantagem das pretas, cerca de uma torre", twin: "+5.0" },
  { id: "0.0", answer: "Posição igual" },
  { id: "M2", answer: "Brancas dão mate em 2", twin: "-M2" },
  { id: "-M2", answer: "Pretas dão mate em 2", twin: "M2" },
];

function evalTextRound(): Screen {
  const it = pick(EVALS);
  return {
    kind: "choice",
    key: `avaliacao:${it.id}`,
    prompt: `A barra de avaliação mostra \`${it.id}\`. O que isso quer dizer?`,
    options: optionsFor(it, EVALS),
    correct: it.answer,
    explain: it.id.includes("M")
      ? `\`M\` é mate. Sem sinal, quem dá o mate são as brancas; com \`-\`, as pretas.`
      : it.id === "0.0"
        ? "Zero quer dizer que ninguém está melhor."
        : `Positivo é bom para as brancas, negativo para as pretas. O número é contado em peões: ${it.answer.split(", ")[1]}.`,
    mistakeNote: `Avaliação \`${it.id}\``,
  };
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function materialOf(fen: string): { w: number; b: number } {
  let w = 0;
  let b = 0;
  for (const ch of parsePlacement(fen).values()) {
    const v = VALUE[ch.toLowerCase()];
    if (ch === ch.toUpperCase()) w += v;
    else b += v;
  }
  return { w, b };
}

const fmt = (d: number) => (d > 0 ? `+${d}.0` : d < 0 ? `${d}.0` : "0.0");

/** An opening position with one or two pieces missing: what does the material count say? */
function evalBoardRound(): Screen | null {
  for (let tries = 0; tries < 50; tries++) {
    const base = pick(OPENINGS);
    const placement = parsePlacement(base);
    const removable = [...placement.entries()].filter(([, ch]) => ch.toLowerCase() !== "k");
    const first = pick(removable);
    placement.delete(first[0]);
    if (Math.random() < 0.4) {
      // Second piece from the other side, of a different value.
      const other = removable.filter(
        ([sq, ch]) => sq !== first[0] && (ch === ch.toUpperCase()) !== (first[1] === first[1].toUpperCase()) && VALUE[ch.toLowerCase()] !== VALUE[first[1].toLowerCase()],
      );
      if (other.length) placement.delete(pick(other)[0]);
    }
    const fen = toFen(placement, `${base.split(" ")[1]} - - 0 1`);
    if (!isLegalPosition(fen)) continue;
    const { w, b } = materialOf(fen);
    const diff = w - b;
    const correct = fmt(diff);
    const wrong = diff !== 0 ? [fmt(-diff), fmt(diff > 0 ? diff + 2 : diff - 2)] : ["+3.0", "-3.0"];
    return {
      kind: "choice",
      key: `material:${fen}`,
      prompt: "Contando só o material, qual avaliação combina com esta posição?",
      board: { fen, orientation: "white" },
      options: shuffle([correct, ...wrong]).map((v) => ({ id: v, label: v, mono: true })),
      correct,
      explain: `Brancas somam **${w}** pontos e pretas **${b}**: ${diff === 0 ? "empate no material" : `diferença de ${Math.abs(diff)} para as ${diff > 0 ? "brancas" : "pretas"}`}, por isso \`${correct}\`.`,
      mistakeNote: "Material em números",
    };
  }
  return null;
}

export const lessonSimbolos: LessonDef = {
  id: "m4-l4",
  title: "Símbolos e avaliações",
  summary: "!!, ??, a revisão do chess.com e o número da barra de avaliação.",
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "Sinais de comentário",
      text: "Livros, o Lichess e o chess.com usam sinais depois do lance para dar uma opinião sobre ele.",
      steps: [
        "`!!` lance brilhante e `!` bom lance.",
        "`!?` lance interessante e `?!` lance duvidoso.",
        "`?` erro e `??` erro grave.",
      ],
      tip: "Exclamação elogia, interrogação critica. Na análise do Lichess, `?!`, `?` e `??` marcam imprecisão, erro e erro grave.",
    },
    ...annotationRounds(2),
    {
      kind: "explain",
      title: "A revisão do chess.com",
      text: "Depois da partida, a **Revisão da Partida** dá um nome para cada lance, comparando com o que o computador jogaria.",
      steps: [
        "**Brilliant** (brilhante) e **Great** (ótimo): lances fortes e difíceis de achar. O brilhante tem um sacrifício.",
        "**Best** (melhor), **Excellent** (excelente) e **Good** (bom): o melhor lance ou quase.",
        "**Book** (teórico): lance conhecido da teoria de aberturas.",
        "**Inaccuracy** (imprecisão) e **Mistake** (erro): perdem um pouco ou bastante.",
        "**Miss** (chance perdida): o adversário errou e você não aproveitou.",
        "**Blunder** (capivarada): erro grave, que costuma entregar a partida.",
      ],
    },
    ...reviewRounds(2),
    {
      kind: "explain",
      title: "O número da avaliação",
      text: "A barra ao lado do tabuleiro mostra quem está melhor, **em peões**, usando os pontos da lição 4.1. Positivo é bom para as brancas, negativo para as pretas.",
      steps: [
        "`+1.0`: brancas com cerca de um peão a mais.",
        "`-3.0`: pretas com cerca de um cavalo ou bispo a mais.",
        "`0.0`: posição igual.",
        "`M3` (chess.com) ou `#3` (Lichess): mate em 3. Com `-` na frente, o mate é das pretas.",
      ],
      tip: "O computador também conta posição, não só material. Mas a escala é sempre essa: 1 = um peão.",
    },
    evalTextRound(),
    ...([evalBoardRound()].filter(Boolean) as Screen[]),
  ],
};

/* ---------- 4.5 placar e lances ambíguos ---------- */

const RESULTS: Item[] = [
  { id: "1-0", answer: "As brancas venceram", twin: "0-1" },
  { id: "0-1", answer: "As pretas venceram", twin: "1-0" },
  { id: "½-½", answer: "Empate" },
];

function resultRound(): Screen {
  const it = pick(RESULTS);
  return {
    kind: "choice",
    key: `placar:${it.id}`,
    prompt: `No fim de uma partida aparece \`${it.id}\`. O que aconteceu?`,
    options: shuffle(RESULTS.map((r) => r.answer)).map((a) => ({ id: a, label: a })),
    correct: it.answer,
    explain: "O primeiro número é das brancas, o segundo das pretas: vitória vale 1, empate vale ½ para cada.",
    mistakeNote: `Placar \`${it.id}\``,
  };
}

const KNIGHT_JUMPS = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

function knightOrigins(target: Square): Square[] {
  return KNIGHT_JUMPS.map(([df, dr]) => toSquare(fileIndex(target) + df, rankOf(target) + dr)).filter(Boolean) as Square[];
}

function rookOrigins(target: Square): Square[] {
  return ALL_SQUARES.filter((s) => s !== target && (s[0] === target[0] || s[1] === target[1]));
}

interface Ambiguous {
  fen: string;
  san: string;
  otherSan: string;
  move: ReturnType<typeof legalMoves>[number];
}

/** Two equal pieces that can both go to the same square. */
function ambiguousPosition(): Ambiguous | null {
  for (let tries = 0; tries < 80; tries++) {
    const type = pick(["n", "r"] as const);
    const turn = pick(["w", "b"] as const);
    const target = pick(ALL_SQUARES.filter((s) => rankOf(s) >= 2 && rankOf(s) <= 7));
    const origins = type === "n" ? knightOrigins(target) : rookOrigins(target);
    if (origins.length < 2) continue;
    const [a, b] = pickDistinct(origins, 2);
    const ch = (turn === "w" ? type.toUpperCase() : type) as PieceChar;
    const pieces: Partial<Record<Square, string>> = { [a]: ch, [b]: ch };
    // A few pawns so the board looks like a game.
    const free = ALL_SQUARES.filter((s) => !pieces[s] && s !== target && rankOf(s) >= 2 && rankOf(s) <= 7);
    for (const s of pickDistinct(free, 2)) pieces[s] = "P";
    for (const s of pickDistinct(free.filter((s) => !pieces[s]), 2)) pieces[s] = "p";
    const fen = withRandomKings(pieces, turn, (f) => {
      const moves = legalMoves(f).filter((m) => m.to === target && m.piece === type);
      return moves.length >= 2 && moves.every((m) => withoutOrigin(m.san) !== m.san);
    });
    if (!fen) continue;
    const moves = legalMoves(fen).filter((m) => m.to === target && m.piece === type);
    const move = pick(moves);
    const other = moves.find((m) => m.from !== move.from)!;
    return { fen, san: move.san, otherSan: other.san, move };
  }
  return null;
}

function ambiguousReadRound(): Screen | null {
  const amb = ambiguousPosition();
  if (!amb) return null;
  const { fen, san, otherSan, move } = amb;
  const arrow = { from: move.from as Square, to: move.to as Square };
  return {
    kind: "choice",
    key: `ambiguo-ler:${fen}:${san}`,
    prompt: "Duas peças iguais podem ir para a mesma casa. Como se escreve o lance da seta?",
    board: boardFor(fen, { arrows: [arrow] }),
    revealBoard: boardFor(fen, { arrows: [{ ...arrow, tone: "good" }] }),
    options: shuffle([san, withoutOrigin(san), otherSan]).map((v) => ({ id: v, label: v, mono: true })),
    correct: san,
    explain: `\`${san}\` (${readMove(move)}). Só \`${withoutOrigin(san)}\` não diz qual das duas peças foi.`,
    mistakeNote: `Escrever \`${san}\``,
  };
}

function ambiguousPlayRound(): Screen | null {
  const amb = ambiguousPosition();
  if (!amb) return null;
  const { fen, san, move } = amb;
  return {
    kind: "move",
    key: `ambiguo-jogar:${fen}:${san}`,
    prompt: `Jogue \`${san}\` (${readMove(move)}).`,
    board: boardFor(fen),
    accept: (m) => m.san === san,
    solution: uciOf(move),
    wrong: (m) => `Você jogou \`${m.san}\` (${readMove(m)}). O pedido era \`${san}\`: repare de onde a peça sai.`,
    success: "Isso. A letra ou número extra diz de onde a peça sai.",
    mistakeNote: `Jogar \`${san}\``,
  };
}

export const lessonDetalhesNotacao: LessonDef = {
  id: "m4-l5",
  title: "Placar e lances ambíguos",
  summary: "1-0, 0-1, ½-½ e lances como Nbd2 e R1e2.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "O placar",
      text: "`1-0`: as brancas venceram. `0-1`: as pretas venceram. `½-½`: empate.",
      tip: "Você vê isso no fim das partidas no chess.com, no Lichess e em livros.",
    },
    resultRound(),
    {
      kind: "explain",
      title: "Qual das duas?",
      text: "Quando duas peças iguais podem ir para a mesma casa, a notação diz de onde a peça sai: a **coluna** (`Nbd2`, cavalo da coluna b para d2) ou, se a coluna for a mesma, a **fileira** (`R1e2`, torre da fileira 1 para e2).",
      board: {
        fen: "4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1",
        arrows: [
          { from: "b1", to: "d2", tone: "good" },
          { from: "f3", to: "d2" },
        ],
      },
      tip: "Aqui os dois cavalos chegam em `d2`. A seta verde é `Nbd2`, a outra é `Nfd2`.",
    },
    ...([ambiguousReadRound(), ambiguousReadRound(), ambiguousPlayRound(), ambiguousPlayRound()].filter(Boolean) as Screen[]),
  ],
};
