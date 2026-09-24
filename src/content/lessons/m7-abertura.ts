import { countText } from "@/content/lib/text";
import type { LessonDef, Screen } from "@/content/types";
import { hangingPieces } from "@/content/lib/analysis";
import { afterMove, boardFor } from "@/content/lib/positions";
import { legalMoves, load, uciOf } from "@/lib/chess/game";
import { readMove } from "@/lib/chess/notation";
import { START_FEN, type Square } from "@/lib/chess/squares";
import { pick, pickDistinct, shuffle } from "@/lib/random";

const CENTER: Square[] = ["d4", "e4", "d5", "e5"];

/** Center squares the side covers (occupies or attacks). */
function centerControl(fen: string, color: "w" | "b"): number {
  const g = load(fen);
  return CENTER.filter((sq) => g.isAttacked(sq, color) || g.get(sq)?.color === color).length;
}

interface OpeningSpot {
  fen: string;
  good: string[];
  note: string;
}

const CENTER_SPOTS: OpeningSpot[] = [
  { fen: START_FEN, good: ["e4", "d4", "c4", "Nf3"], note: "Os lances clássicos são `e4` e `d4`: o peão ocupa o centro e abre caminho para as peças." },
  { fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1", good: ["e5", "c5", "d5", "e6", "c6", "Nf6"], note: "Contra `e4`, respostas como `e5` e `c5` disputam o centro na hora." },
  { fen: "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1", good: ["d5", "Nf6", "e6", "f5"], note: "Contra `d4`, `d5` e `Nf6` impedem as brancas de dominar o centro." },
  { fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2", good: ["Nf3", "Nc3", "d4", "Bc4", "f4"], note: "`Nf3` desenvolve atacando o peão de `e5`: centro e desenvolvimento no mesmo lance." },
];

function centerRounds(n: number): Screen[] {
  return pickDistinct(CENTER_SPOTS, n).map((spot) => {
    const sol = legalMoves(spot.fen).find((m) => m.san === spot.good[0])!;
    return {
      kind: "move",
      key: `centro:${spot.fen}`,
      prompt: "Jogue um lance que ocupa ou disputa o centro.",
      board: boardFor(spot.fen, { marks: { d4: "soft", e4: "soft", d5: "soft", e5: "soft" } }),
      accept: (m) => spot.good.includes(m.san),
      solution: uciOf(sol),
      wrong: (m) => `\`${m.san}\` (${readMove(m)}) não briga pelo centro. ${spot.note}`,
      success: spot.note,
      mistakeNote: "Lutar pelo centro",
    } satisfies Screen;
  });
}

function centerChoice(): Screen {
  const fen = START_FEN;
  const moves = legalMoves(fen);
  const options = shuffle(["e4", pick(["a4", "h4"]), pick(["Na3", "Nh3"]), pick(["g3", "b3", "a3", "h3"])]);
  return {
    kind: "choice",
    key: `centro-escolha:${options.join(",")}`,
    prompt: "Qual destes lances controla mais o centro?",
    board: { fen, marks: { d4: "soft", e4: "soft", d5: "soft", e5: "soft" } },
    options: options.map((san) => ({ id: san, label: san, mono: true })),
    correct: "e4",
    explain: `\`e4\` ocupa \`e4\` e ataca \`d5\`. Depois dele, as brancas controlam ${centerControl(afterMove(fen, moves.find((m) => m.san === "e4")!)!.fen(), "w")} das 4 casas centrais.`,
    mistakeNote: "Qual lance controla o centro",
  };
}

/* ---------- desenvolvimento ---------- */

const DEVELOP_SPOTS = [
  "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
  "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  "rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 1 2",
  "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
  "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq - 0 2",
];

function isDevelopingMove(fen: string, m: { piece: string; from: string; to: string }): boolean {
  const backRank = fen.split(" ")[1] === "w" ? "1" : "8";
  return (m.piece === "n" || m.piece === "b") && m.from[1] === backRank && !"ah".includes(m.to[0]);
}

function developRounds(n: number): Screen[] {
  return pickDistinct(DEVELOP_SPOTS, n).map((fen) => {
    const color = fen.split(" ")[1] as "w" | "b";
    const ok = (m: Parameters<typeof isDevelopingMove>[1] & { from: string; to: string; promotion?: string }) =>
      isDevelopingMove(fen, m) && hangingPieces(afterMove(fen, m as never)!.fen(), color).length === 0;
    const sol = legalMoves(fen).find((m) => ok(m))!;
    return {
      kind: "move",
      key: `desenvolver:${fen}`,
      prompt: "Desenvolva um cavalo ou um bispo para uma boa casa.",
      board: boardFor(fen),
      accept: (m) => ok(m),
      solution: uciOf(sol),
      wrong: (m) => {
        if (m.piece === "n" && "ah".includes(m.to[0])) return "Cavalo na borda controla poucas casas. Leve-o para perto do centro.";
        if (m.piece === "q") return "A dama cedo vira alvo: as peças do adversário se desenvolvem atacando ela.";
        if (m.piece === "p") return "Peão já temos no centro. Agora é hora de tirar cavalos e bispos de casa.";
        if (isDevelopingMove(fen, m)) return `Depois de \`${m.san}\` sobra uma peça sua desprotegida. Escolha outra casa.`;
        return `\`${m.san}\` não desenvolve cavalo nem bispo da fileira de trás.`;
      },
      success: "Cada peça desenvolvida é uma peça a mais jogando.",
      mistakeNote: "Desenvolver peças",
    } satisfies Screen;
  });
}

const UNDEVELOPED_SPOTS = [
  "r1bqkb1r/pppp1ppp/2n2n2/4p3/4P3/2N2N2/PPPP1PPP/R1BQKB1R w KQkq - 4 4",
  "rnbqk2r/ppppbppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  "r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 3 3",
];

function undevelopedRound(): Screen {
  const fen = pick(UNDEVELOPED_SPOTS);
  const g = load(fen);
  const targets = (["b1", "c1", "f1", "g1"] as Square[]).filter((sq) => {
    const p = g.get(sq);
    return p && p.color === "w" && (p.type === "n" || p.type === "b");
  });
  return {
    kind: "tapAll",
    key: `nao-desenvolvidas:${fen}`,
    prompt: `Toque nas peças brancas (cavalos e bispos) que ainda não saíram de casa. ${countText(targets.length)}`,
    board: { fen },
    targets,
    wrong: (sq) => {
      const p = g.get(sq);
      if (!p || p.color !== "w") return "Olhe as peças brancas.";
      if (p.type === "n" || p.type === "b") return "Essa peça já foi desenvolvida.";
      return "Conte só cavalos e bispos: rei, dama e torres entram depois.";
    },
    success: "Essas são as próximas candidatas a jogar.",
    mistakeNote: "Ver peças não desenvolvidas",
  };
}

/* ---------- rei seguro ---------- */

const CASTLE_SPOTS = [
  "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  "rnbqk2r/ppppbppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  "r1bqk2r/pppp1ppp/2n2n2/1Bb1p3/4P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5",
  "rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4",
];

function castleSafetyRounds(n: number): Screen[] {
  return pickDistinct(CASTLE_SPOTS, n).map((fen) => {
    const castle = legalMoves(fen).find((m) => m.flags.includes("k"))!;
    return {
      kind: "move",
      key: `rei-seguro:${fen}`,
      prompt: "As peças já saíram. Coloque o rei em segurança.",
      board: boardFor(fen),
      accept: (m) => m.flags.includes("k") || m.flags.includes("q"),
      solution: uciOf(castle),
      wrong: (m) =>
        m.piece === "k" ? "Andar com o rei a pé deixa ele no meio e tira o direito de rocar. Faça o roque." : `\`${m.san}\` é um lance, mas o rei continua no centro. Aqui o roque é o melhor.`,
      success: "Rei protegido e torre pronta para jogar.",
      mistakeNote: "Rocar na hora certa",
    } satisfies Screen;
  });
}

function weakKingChoice(): Screen {
  const fen = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";
  const options = ["f3", "Nf3", "Nc3", "Bc4"];
  return {
    kind: "choice",
    key: "enfraquece-rei",
    prompt: "Qual destes lances enfraquece o próprio rei?",
    board: { fen, marks: { e1: "focus" } },
    options: shuffle(options).map((san) => ({ id: san, label: san, mono: true })),
    correct: "f3",
    explain: "`f3` abre a diagonal `e1`-`h4`, rouba a melhor casa do cavalo e expõe o rei. Os outros desenvolvem peças.",
    mistakeNote: "Lance que enfraquece o rei",
  };
}

/* ---------- erros comuns ---------- */

function foolsMate(): Screen {
  return {
    kind: "sequence",
    key: "mate-do-louco",
    prompt: "As brancas abriram mal com `f3`. Puna o erro com as pretas e dê o mate mais rápido do xadrez.",
    board: { fen: "rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1", orientation: "black", lastMove: ["f2", "f3"] },
    line: ["e7e5", "g2g4", "d8h4"],
    anyMateAtEnd: true,
    comments: ["Abre a diagonal da dama até `h4`.", "Mate! A diagonal do rei branco estava aberta."],
    wrong: (_m, i) => (i === 0 ? "Comece com `e5` (peão para e5): abre caminho para a dama." : "Leve a dama para `h4` (`Qh4#`) pela diagonal aberta."),
    success: "Esse é o mate do louco: dois lances ruins de peão e acabou.",
    mistakeNote: "Mate do louco",
  };
}

function earlyQueen(): Screen {
  return {
    kind: "sequence",
    key: "dama-cedo",
    prompt: "As brancas trouxeram a dama cedo. Desenvolva suas peças atacando ela.",
    board: { fen: "rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2", orientation: "black", lastMove: ["d1", "h5"] },
    line: ["b8c6", "f1c4", "g7g6", "h5f3", "g8f6"],
    comments: [
      "Protege o peão de `e5` desenvolvendo o cavalo.",
      "Ataca a dama, que precisa fugir de novo.",
      "Bloqueia a dama e desenvolve mais uma peça. As pretas ganharam tempo.",
    ],
    wrong: (_m, i) =>
      [
        "A dama ataca `e5`. Proteja o peão desenvolvendo o cavalo: `Nc6`.",
        "Agora a dama e o bispo miram `f7`. Ataque a dama com o peão: `g6`.",
        "A dama voltou para `f3` e mira `f7`. Feche a linha com o cavalo: `Nf6`.",
      ][i] ?? "Desenvolva atacando a dama.",
    success: "Cada lance da dama foi um lance a menos de desenvolvimento para as brancas.",
    mistakeNote: "Punir a dama cedo",
  };
}

function principleQuiz(n: number): Screen[] {
  const items = [
    {
      q: "Por que não mexer a mesma peça várias vezes na abertura?",
      a: "Enquanto isso, as outras peças ficam paradas",
      o: ["Porque é proibido pelas regras", "Porque a peça fica cansada"],
    },
    {
      q: "Qual é a ordem mais comum na abertura?",
      a: "Peão no centro, cavalos e bispos, roque",
      o: ["Dama primeiro, depois o resto", "Torres primeiro, depois peões"],
    },
    {
      q: "O que costuma acontecer com a dama que sai muito cedo?",
      a: "Vira alvo e perde tempo fugindo",
      o: ["Dá mate rápido quase sempre", "Fica protegida pelo rei"],
    },
    {
      q: "Por que \"cavalo na borda é triste\"?",
      a: "Na borda ele controla menos casas",
      o: ["Porque pode ser capturado por peões", "Porque não pode voltar"],
    },
  ];
  return pickDistinct(items, n).map((it) => ({
    kind: "choice",
    key: `principio:${it.q}`,
    prompt: it.q,
    options: shuffle([it.a, ...it.o]).map((t) => ({ id: t, label: t })),
    correct: it.a,
    explain: it.a + ".",
    mistakeNote: "Princípios de abertura",
  }));
}

/* ---------- lessons ---------- */

export const lessonCentro: LessonDef = {
  id: "m7-l1",
  title: "Controle o centro",
  summary: "As quatro casas do meio valem ouro no começo da partida.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "O centro",
      text: "As casas `d4`, `e4`, `d5` e `e5` são o **centro**. Peças no centro alcançam mais casas e chegam rápido aos dois lados do tabuleiro.",
      board: { marks: { d4: "focus", e4: "focus", d5: "focus", e5: "focus" } },
    },
    {
      kind: "tapAll",
      key: "casas-centrais",
      prompt: "Toque nas quatro casas do centro.",
      board: {},
      targets: CENTER,
      wrong: (sq) => `\`${sq}\` fica fora do centro. O centro são as quatro casas do meio.`,
      success: "`d4`, `e4`, `d5` e `e5`.",
      mistakeNote: "Casas centrais",
    },
    centerChoice(),
    ...centerRounds(2),
  ],
};

export const lessonDesenvolvimento: LessonDef = {
  id: "m7-l2",
  title: "Desenvolva as peças",
  summary: "Tire cavalos e bispos de casa antes de mexer dama e torres.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Desenvolver",
      text: "**Desenvolver** é tirar as peças da fileira de trás para casas ativas. Primeiro cavalos e bispos, mirando o centro. Dama e torres entram depois.",
      board: { fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", marks: { f3: "good", c4: "good" } },
      tip: "Evite mexer a mesma peça duas vezes antes de desenvolver as outras.",
    },
    undevelopedRound(),
    ...developRounds(3),
    ...principleQuiz(1),
  ],
};

export const lessonReiSeguro: LessonDef = {
  id: "m7-l3",
  title: "Rei seguro com o roque",
  summary: "Role cedo e não enfraqueça os peões na frente do rei.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Tire o rei do meio",
      text: "No centro o rei fica exposto quando as colunas abrem. Com cavalo e bispo fora, faça o **roque**. E evite mexer os peões na frente do rei, principalmente o de `f`.",
      board: { fen: "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w - - 6 5", marks: { g1: "good", g8: "good" } },
    },
    ...castleSafetyRounds(2),
    weakKingChoice(),
    ...castleSafetyRounds(1),
  ],
};

export const lessonErrosAbertura: LessonDef = {
  id: "m7-l4",
  title: "Erros comuns e armadilhas",
  summary: "Mate do louco, dama cedo e outros erros de abertura.",
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "Aprender com os erros",
      text: "Os erros mais comuns da abertura: mexer peões na frente do rei, trazer a dama cedo e esquecer o desenvolvimento. Veja como punir cada um.",
      board: { fen: "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3", marks: { e1: "bad" }, arrows: [{ from: "h4", to: "e1" }] },
    },
    foolsMate(),
    earlyQueen(),
    ...principleQuiz(2),
  ],
};
