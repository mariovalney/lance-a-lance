import type { LessonDef, Screen } from "@/content/types";
import { afterMove, boardFor, randomVariant, withRandomKings } from "@/content/lib/positions";
import { toFen, type PieceChar } from "@/lib/chess/fen";
import { legalMoves, load, pieceDestinations, uciOf } from "@/lib/chess/game";
import { readMove } from "@/lib/chess/notation";
import { ALL_SQUARES, START_FEN, fileIndex, rankOf, toSquare, type Square } from "@/lib/chess/squares";
import { pick, pickDistinct, randInt, shuffle } from "@/lib/random";

export const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const NAME: Record<string, string> = { p: "peão", n: "cavalo", b: "bispo", r: "torre", q: "dama" };
const WITH_ARTICLE: Record<string, string> = { p: "um peão", n: "um cavalo", b: "um bispo", r: "uma torre", q: "a dama" };
const INNER = ALL_SQUARES.filter((s) => rankOf(s) >= 2 && rankOf(s) <= 7);

/* ---------- 4.1 valor ---------- */

function valueRounds(n: number): Screen[] {
  return pickDistinct(["p", "n", "b", "r", "q"], n).map((p) => ({
    kind: "choice",
    key: `valor:${p}`,
    prompt: `Quanto vale ${p === "q" || p === "r" ? "a" : "o"} **${NAME[p]}**?`,
    board: { fen: toFen({ d4: p.toUpperCase() as PieceChar }, "w - - 0 1"), marks: { d4: "soft" } },
    options: ["1", "3", "5", "9"].map((v) => ({ id: v, label: `${v} ${v === "1" ? "ponto" : "pontos"}` })),
    correct: String(VALUE[p]),
    explain:
      p === "b" || p === "n"
        ? `${NAME[p][0].toUpperCase() + NAME[p].slice(1)} vale 3: cavalo e bispo valem mais ou menos o mesmo.`
        : `${NAME[p][0].toUpperCase() + NAME[p].slice(1)} vale ${VALUE[p]}.`,
    mistakeNote: `Valor ${p === "q" || p === "r" ? "da" : "do"} ${NAME[p]}`,
  }));
}

function sumText(pieces: string[]): string {
  if (!pieces.length) return "0";
  return `${pieces.map((p) => VALUE[p]).join(" + ")} = ${pieces.reduce((s, p) => s + VALUE[p], 0)}`;
}

function materialRounds(n: number): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 100) {
    const white = Array.from({ length: randInt(2, 4) }, () => pick(["p", "n", "b", "r", "q", "p"]));
    const black = Array.from({ length: randInt(2, 4) }, () => pick(["p", "n", "b", "r", "q", "p"]));
    const ws = white.reduce((s, p) => s + VALUE[p], 0);
    const bs = black.reduce((s, p) => s + VALUE[p], 0);
    if (out.length === 0 && ws === bs) continue;
    const squares = pickDistinct(INNER, white.length + black.length);
    const pieces: Partial<Record<Square, string>> = {};
    white.forEach((p, i) => (pieces[squares[i]] = p.toUpperCase()));
    black.forEach((p, i) => (pieces[squares[white.length + i]] = p));
    const fen = withRandomKings(pieces, "w", (f) => !load(f).isCheck());
    if (!fen) continue;
    const correct = ws > bs ? "brancas" : bs > ws ? "pretas" : "igual";
    out.push({
      kind: "choice",
      key: `material:${fen}`,
      prompt: "Somando os pontos, quem tem mais material?",
      board: { fen },
      options: [
        { id: "brancas", label: "Brancas" },
        { id: "pretas", label: "Pretas" },
        { id: "igual", label: "Igual" },
      ],
      correct,
      explain: `Brancas: ${sumText(white)}. Pretas: ${sumText(black)}.${correct === "igual" ? " Empate no material." : ""}`,
      mistakeNote: "Contar material",
    });
  }
  return out;
}

/* ---------- 4.2 trocas ---------- */

function tradeRounds(n: number): Screen[] {
  const pairs: [string, string][] = [];
  const all = ["p", "n", "b", "r", "q"];
  for (const a of all) for (const b of all) if (a !== b || a === "r") pairs.push([a, b]);
  return pickDistinct(pairs, n).map(([won, lost]) => {
    const net = VALUE[won] - VALUE[lost];
    const correct = net > 0 ? "ganhou" : net < 0 ? "perdeu" : "igual";
    return {
      kind: "choice",
      key: `troca:${won}:${lost}`,
      prompt: `Você captura ${WITH_ARTICLE[won]} e depois perde ${WITH_ARTICLE[lost]}. Como ficou?`,
      options: [
        { id: "ganhou", label: "Ganhei material" },
        { id: "igual", label: "Troca igual" },
        { id: "perdeu", label: "Perdi material" },
      ],
      correct,
      explain: `Ganhou ${VALUE[won]}, perdeu ${VALUE[lost]}: ${net > 0 ? `saldo de +${net}` : net < 0 ? `saldo de ${net}` : "saldo zero"}.`,
      mistakeNote: "Avaliar uma troca",
    } satisfies Screen;
  });
}

/** Two captures; pick the one with the best balance (captured value minus what you lose back). */
function bestCaptureRounds(n: number): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 500) {
    const attacker = pick(["N", "B", "R", "Q"]);
    const from = pick(ALL_SQUARES);
    const reach = pieceDestinations(attacker, from, () => undefined).filter((s) => INNER.includes(s));
    if (reach.length < 2) continue;
    const [a, b] = pickDistinct(reach, 2);
    const ta = pick(["p", "n", "b", "r", "q"]);
    const tb = pick(["p", "n", "b", "r", "q"]);
    const pieces: Partial<Record<Square, string>> = { [from]: attacker, [a]: ta, [b]: tb };
    // Defend one of them with a black pawn.
    const guarded = pick([a, b]);
    const d = toSquare(fileIndex(guarded) + pick([-1, 1]), rankOf(guarded) + 1);
    if (!d || pieces[d] || rankOf(d) > 7) continue;
    pieces[d] = "p";
    const fen = toFen(pieces as Partial<Record<Square, PieceChar>>, "w - - 0 1");
    const captures = legalMoves(fen).filter((m) => m.captured);
    if (captures.length !== 2) continue;
    const score = (m: (typeof captures)[number]) => {
      const after = afterMove(fen, m)!;
      return VALUE[m.captured!] - (after.isAttacked(m.to as Square, "b") ? VALUE[attacker.toLowerCase()] : 0);
    };
    const [s1, s2] = captures.map(score);
    if (s1 === s2 || Math.max(s1, s2) <= 0) continue;
    const best = s1 > s2 ? captures[0] : captures[1];
    const bestScore = Math.max(s1, s2);
    out.push({
      kind: "move",
      key: `melhor-captura:${fen}`,
      prompt: "Duas capturas possíveis. Faça a que ganha mais material, contando o que você pode perder de volta.",
      board: { fen },
      accept: (m) => m.to === best.to,
      solution: uciOf(best),
      wrong: (m) => {
        const s = m.captured ? score(m) : 0;
        return m.captured
          ? `Essa captura dá saldo de ${s > 0 ? "+" : ""}${s}. A outra dá +${bestScore}.`
          : "Você não capturou nada.";
      },
      success: `Saldo de +${bestScore}. Capturar peça protegida só compensa se ela valer mais que a sua.`,
      mistakeNote: "Escolher a melhor captura",
    });
  }
  return out;
}

/* ---------- 4.3 notação ---------- */

export const OPENINGS = [
  START_FEN,
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
  "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  "rnbqkb1r/ppp1pppp/5n2/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 1 3",
  "rnbqkb1r/pp2pppp/2p2n2/3p4/2PP4/2N5/PP2PPPP/R1BQKBNR w KQkq - 0 4",
  "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 1 5",
];

function interestingMoves(fen: string) {
  return legalMoves(fen).filter((m) => m.piece !== "k" || m.flags.includes("k"));
}

function readRounds(n: number): Screen[] {
  return pickDistinct(OPENINGS, n).map((base) => {
    const fen = randomVariant(base, undefined, { flip: true });
    const moves = shuffle(interestingMoves(fen));
    const correct = moves[0];
    const options = shuffle([correct, ...moves.slice(1).filter((m) => m.san !== correct.san).slice(0, 3)]);
    return {
      kind: "choice",
      key: `ler-lance:${fen}:${correct.san}`,
      prompt: "Como se escreve o lance da seta?",
      board: boardFor(fen, { arrows: [{ from: correct.from as Square, to: correct.to as Square }] }),
      revealBoard: boardFor(fen, { arrows: [{ from: correct.from as Square, to: correct.to as Square, tone: "good" }] }),
      options: options.map((m) => ({ id: m.san, label: m.san, mono: true })),
      correct: correct.san,
      explain: `\`${correct.san}\` (${readMove(correct)}).`,
      mistakeNote: `Escrever \`${correct.san}\``,
    } satisfies Screen;
  });
}

function playRounds(n: number): Screen[] {
  return pickDistinct(OPENINGS, n).map((base) => {
    const fen = randomVariant(base, undefined, { flip: true });
    const moves = interestingMoves(fen);
    const captures = moves.filter((m) => m.captured || m.san.includes("+"));
    const target = pick(captures.length && Math.random() < 0.5 ? captures : moves);
    return {
      kind: "move",
      key: `jogar-lance:${fen}:${target.san}`,
      prompt: `Jogue \`${target.san}\` (${readMove(target)}).`,
      board: boardFor(fen),
      accept: (m) => m.san === target.san,
      solution: uciOf(target),
      wrong: (m) => `Você jogou \`${m.san}\` (${readMove(m)}). O pedido era \`${target.san}\`.`,
      success: "Lance lido e jogado.",
      mistakeNote: `Jogar \`${target.san}\``,
    } satisfies Screen;
  });
}

function symbolRounds(): Screen[] {
  const items = [
    { sym: "x", answer: "Captura" },
    { sym: "+", answer: "Xeque" },
    { sym: "#", answer: "Xeque-mate" },
    { sym: "O-O", answer: "Roque pequeno" },
    { sym: "O-O-O", answer: "Roque grande" },
    { sym: "=Q", answer: "Promoção a dama" },
  ];
  return pickDistinct(items, 2).map((it) => {
    const others = pickDistinct(
      items.filter((o) => o.sym !== it.sym).map((o) => o.answer),
      2,
    );
    return {
      kind: "choice",
      key: `simbolo:${it.sym}`,
      prompt: `Na notação, o que significa \`${it.sym}\`?`,
      options: shuffle([it.answer, ...others]).map((a) => ({ id: a, label: a })),
      correct: it.answer,
      explain: `\`${it.sym}\` quer dizer ${it.answer.toLowerCase()}.`,
      mistakeNote: `Símbolo \`${it.sym}\``,
    } satisfies Screen;
  });
}

export const lessonValor: LessonDef = {
  id: "m4-l1",
  title: "Quanto vale cada peça",
  summary: "Peão 1, cavalo e bispo 3, torre 5, dama 9.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Os pontos das peças",
      text: "Para comparar peças, use pontos: **peão 1**, **cavalo 3**, **bispo 3**, **torre 5**, **dama 9**. O rei não tem pontos: perder o rei é perder o jogo.",
      board: {
        fen: toFen({ b4: "P", c4: "N", d4: "B", e4: "R", f4: "Q", g4: "K" }, "w - - 0 1"),
        labels: { b3: "1", c3: "3", d3: "3", e3: "5", f3: "9" },
      },
    },
    ...valueRounds(3),
    {
      kind: "explain",
      title: "Material",
      text: "Somar os pontos de cada lado mostra quem tem mais **material**. Quem tem mais material costuma ter vantagem.",
      board: { fen: "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1", marks: { d1: "focus" } },
      tip: "Aqui as brancas têm uma torre a mais: +5.",
    },
    ...materialRounds(3),
  ],
};

export const lessonTrocas: LessonDef = {
  id: "m4-l2",
  title: "Trocas boas e ruins",
  summary: "Compare o que você captura com o que pode perder de volta.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Troca",
      text: "Numa **troca**, você captura e o adversário captura de volta. Compare os pontos: ganhar um cavalo (3) e perder uma torre (5) dá saldo de -2.",
      board: {
        fen: "8/8/2p5/3n4/8/8/8/3R4 w - - 0 1",
        arrows: [
          { from: "d1", to: "d5" },
          { from: "c6", to: "d5", tone: "hint" },
        ],
      },
    },
    ...tradeRounds(3),
    {
      kind: "explain",
      title: "Capturar peça protegida",
      text: "Capturar uma peça protegida só vale a pena se ela valer mais que a sua. Cavalo que captura dama protegida ainda sai com +6.",
      board: {
        fen: "8/8/2p5/3q4/8/4N3/8/8 w - - 0 1",
        arrows: [
          { from: "e3", to: "d5", tone: "good" },
          { from: "c6", to: "d5", tone: "hint" },
        ],
      },
    },
    ...bestCaptureRounds(3),
  ],
};

export const lessonNotacao: LessonDef = {
  id: "m4-l3",
  title: "Lendo e escrevendo lances",
  summary: "A notação do chess.com: letra da peça em inglês e casa de destino.",
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "A notação",
      text: "Cada lance é a letra da peça (em inglês) mais a casa de destino: **K** rei, **Q** dama, **R** torre, **B** bispo, **N** cavalo. O peão não tem letra: `e4` é peão para e4.",
      board: { fen: START_FEN, arrows: [{ from: "g1", to: "f3" }] },
      tip: "A seta mostra `Nf3` (cavalo para f3).",
    },
    ...readRounds(2),
    {
      kind: "explain",
      title: "Os símbolos",
      text: "`x` é captura (`Bxc6`), `+` é xeque, `#` é xeque-mate, `O-O` é roque pequeno, `O-O-O` é roque grande e `=Q` é promoção a dama.",
      board: { fen: "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 3 3", arrows: [{ from: "b5", to: "c6", tone: "good" }] },
    },
    ...symbolRounds(),
    ...playRounds(3),
    ...readRounds(1),
  ],
};

