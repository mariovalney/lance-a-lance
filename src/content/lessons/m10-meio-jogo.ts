import { countText } from "@/content/lib/text";
import type { LessonDef, Screen } from "@/content/types";
import { ARTICLE, NAME, hangingPieces } from "@/content/lib/analysis";
import { afterMove, isLegalPosition, placementToFen } from "@/content/lib/positions";
import {
  doubledPawns,
  pawnsOf,
  isolatedPawns,
  mobility,
  openFiles,
  outposts,
  passedPawns,
  pawnIslands,
  randomPawns,
} from "@/content/lib/structure";
import { legalMoves, load, pieceDestinations, uciOf } from "@/lib/chess/game";
import { ALL_SQUARES, FILES, isLight, rankOf, type Square } from "@/lib/chess/squares";
import { pick, pickDistinct, shuffle } from "@/lib/random";

type Pieces = Partial<Record<Square, string>>;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function withKings(pieces: Pieces): Pieces | null {
  const wk = (["g1", "h1", "f1", "e1"] as Square[]).find((s) => !pieces[s]);
  const bk = (["g8", "h8", "f8", "e8"] as Square[]).find((s) => !pieces[s]);
  if (!wk || !bk) return null;
  return { ...pieces, [wk]: "K", [bk]: "k" };
}

function legalFen(pieces: Pieces | null): string | null {
  if (!pieces) return null;
  const fen = placementToFen(pieces, "w - - 0 1");
  return isLegalPosition(fen) && !load(fen).isCheck() ? fen : null;
}

/* ---------- 10.1 estrutura ---------- */

type PawnKind = "isolados" | "dobrados" | "passados";
const FINDER: Record<PawnKind, (fen: string) => Square[]> = {
  isolados: (f) => isolatedPawns(f, "w"),
  dobrados: (f) => doubledPawns(f, "w"),
  passados: (f) => passedPawns(f, "w"),
};
const WHY: Record<PawnKind, string> = {
  isolados: "não tem peão branco nas colunas vizinhas",
  dobrados: "divide a coluna com outro peão branco",
  passados: "não tem peão preto na frente nem nas colunas vizinhas",
};

function pawnKindRound(kind: PawnKind): Screen | null {
  for (let guard = 0; guard < 300; guard++) {
    const fen = legalFen(withKings(randomPawns()));
    if (!fen) continue;
    const targets = FINDER[kind](fen);
    const white = load(fen).board().flat().filter((p) => p?.type === "p" && p.color === "w").length;
    if (targets.length < 1 || targets.length > 3 || targets.length === white) continue;
    return {
      kind: "tapAll",
      key: `peoes-${kind}:${fen}`,
      prompt: `Toque em todos os peões brancos ${kind}. ${countText(targets.length, "m")}`,
      board: { fen },
      targets,
      wrong: (sq) => {
        const p = load(fen).get(sq);
        if (!p || p.type !== "p" || p.color !== "w") return "Olhe só os peões brancos.";
        return `O peão de \`${sq}\` não é ${kind.slice(0, -1)}: um peão ${kind.slice(0, -1)} ${WHY[kind]}.`;
      },
      success: `Um peão ${kind.slice(0, -1)} ${WHY[kind]}.`,
      mistakeNote: `Peões ${kind}`,
    };
  }
  return null;
}

function islandsRound(): Screen | null {
  for (let guard = 0; guard < 200; guard++) {
    const fen = legalFen(withKings(randomPawns()));
    if (!fen) continue;
    const n = pawnIslands(fen, "w");
    if (n < 1 || n > 4) continue;
    return {
      kind: "choice",
      key: `ilhas:${fen}`,
      prompt: "Quantas **ilhas** de peões as brancas têm? (grupos de peões em colunas vizinhas)",
      board: { fen },
      options: ["1", "2", "3", "4"].map((v) => ({ id: v, label: v })),
      correct: String(n),
      explain: `São ${n}. Menos ilhas costuma ser melhor: cada ilha precisa ser defendida separadamente.`,
      mistakeNote: "Contar ilhas de peões",
    };
  }
  return null;
}

/* ---------- 10.2 colunas abertas ---------- */

function openFilePosition(): { fen: string; open: string } | null {
  for (let guard = 0; guard < 300; guard++) {
    const pawns = randomPawns();
    const openFile = pick(["c", "d", "e", "f"]);
    for (const sq of Object.keys(pawns) as Square[]) if (sq[0] === openFile) delete pawns[sq];
    const pieces: Pieces = { ...pawns, a1: "R", f1: "R", a8: "r" };
    if (openFile === "f") {
      delete pieces.f1;
      pieces.e1 = "R";
    }
    const fen = legalFen(withKings(pieces));
    if (!fen) continue;
    const opens = openFiles(fen);
    if (opens.length !== 1 || opens[0] !== openFile) continue;
    return { fen, open: openFile };
  }
  return null;
}

function openFileChoice(): Screen | null {
  const pos = openFilePosition();
  if (!pos) return null;
  const others = pickDistinct(
    FILES.filter((f) => f !== pos.open),
    3,
  );
  return {
    kind: "choice",
    key: `coluna-aberta:${pos.fen}`,
    prompt: "Qual coluna está **aberta** (sem nenhum peão)?",
    board: { fen: pos.fen },
    options: shuffle([pos.open, ...others]).map((f) => ({ id: f, label: `Coluna ${f}`, mono: true })),
    correct: pos.open,
    explain: `A coluna \`${pos.open}\` não tem peões: é a estrada das torres.`,
    mistakeNote: "Achar a coluna aberta",
  };
}

function rookToOpenFile(): Screen | null {
  for (let guard = 0; guard < 50; guard++) {
    const pos = openFilePosition();
    if (!pos) continue;
    const ok = (m: { piece: string; to: string; from: string; promotion?: string }) =>
      m.piece === "r" && m.to[0] === pos.open && hangingPieces(afterMove(pos.fen, m as never)!.fen(), "w").length === 0;
    const sol = legalMoves(pos.fen).find((m) => ok(m));
    if (!sol) continue;
    return {
      kind: "move",
      key: `torre-aberta:${pos.fen}`,
      prompt: "Coloque uma torre na coluna aberta, em uma casa segura.",
      board: { fen: pos.fen },
      accept: (m) => ok(m),
      solution: uciOf(sol),
      wrong: (m) =>
        m.piece === "r" && m.to[0] === pos.open
          ? "Essa casa deixa uma peça sua sem proteção. Escolha outra na mesma coluna."
          : `A coluna aberta é a \`${pos.open}\`. Leve uma torre para lá.`,
      success: "Torre na coluna aberta: ela controla a coluna inteira e pode invadir.",
      mistakeNote: "Torre na coluna aberta",
    };
  }
  return null;
}

/** Files with a black pawn and no white one: half open for White's rooks. */
function semiOpenFiles(fen: string): string[] {
  const white = new Set(pawnsOf(fen, "w").map((s) => s[0]));
  const black = new Set(pawnsOf(fen, "b").map((s) => s[0]));
  return FILES.filter((f) => !white.has(f) && black.has(f));
}

function semiOpenChoice(): Screen | null {
  for (let guard = 0; guard < 300; guard++) {
    const pawns = randomPawns();
    const file = pick(["b", "c", "d", "e", "f"]);
    for (const sq of Object.keys(pawns) as Square[]) if (sq[0] === file && pawns[sq] === "P") delete pawns[sq];
    const fen = legalFen(withKings({ ...pawns, a1: "R" }));
    if (!fen) continue;
    const semi = semiOpenFiles(fen);
    if (semi.length !== 1 || openFiles(fen).length) continue;
    const others = pickDistinct(
      FILES.filter((f) => f !== semi[0]),
      3,
    );
    return {
      kind: "choice",
      key: `semiaberta:${fen}`,
      prompt: "Qual coluna está **semiaberta** para as brancas (sem peão branco, com peão preto)?",
      board: { fen },
      options: shuffle([semi[0], ...others]).map((f) => ({ id: f, label: `Coluna ${f}`, mono: true })),
      correct: semi[0],
      explain: `Na coluna \`${semi[0]}\` só há peão preto. Uma torre branca ali pressiona esse peão, que vira alvo.`,
      mistakeNote: "Achar a coluna semiaberta",
    };
  }
  return null;
}

/** One rook already on the open file: bring the other behind it. */
function doubleRooks(): Screen | null {
  for (let guard = 0; guard < 200; guard++) {
    const pos = openFilePosition();
    if (!pos) continue;
    const g = load(pos.fen);
    const first = (["a1", "e1", "f1"] as Square[]).find((sq) => g.get(sq)?.type === "r" && g.get(sq)?.color === "w");
    const spot = pick(([2, 3] as const).map((r) => `${pos.open}${r}` as Square).filter((sq) => !g.get(sq)));
    if (!first || !spot) continue;
    g.remove(first);
    g.put({ type: "r", color: "w" }, spot);
    const fen = legalFen(Object.fromEntries(ALL_SQUARES.flatMap((sq) => {
      const p = g.get(sq);
      return p ? [[sq, p.color === "w" ? p.type.toUpperCase() : p.type]] : [];
    })) as Pieces);
    if (!fen) continue;
    const ok = (m: { piece: string; from: string; to: string; promotion?: string }) =>
      m.piece === "r" && m.from[0] !== pos.open && m.to[0] === pos.open && hangingPieces(afterMove(fen, m as never)!.fen(), "w").length === 0;
    const sol = legalMoves(fen).find((m) => ok(m));
    if (!sol) continue;
    return {
      kind: "move",
      key: `dobrar-torres:${fen}`,
      prompt: `Uma torre já está na coluna \`${pos.open}\`. Coloque a outra na mesma coluna.`,
      board: { fen, marks: { [spot]: "focus" } },
      accept: (m) => ok(m),
      solution: uciOf(sol),
      wrong: (m) => (m.piece === "r" && m.to[0] === pos.open ? "Essa casa deixa uma peça sua sem proteção." : `Leve a outra torre para a coluna \`${pos.open}\`.`),
      success: "Torres dobradas: uma protege a outra, e juntas pesam o dobro na coluna.",
      mistakeNote: "Dobrar as torres",
    };
  }
  return null;
}

/* ---------- 10.3 casas fortes ---------- */

function outpostTap(): Screen | null {
  for (let guard = 0; guard < 400; guard++) {
    const fen = legalFen(withKings(randomPawns()));
    if (!fen) continue;
    const posts = outposts(fen, "w").filter((s) => rankOf(s) >= 5);
    if (posts.length < 1 || posts.length > 3) continue;
    return {
      kind: "tapAll",
      key: `casas-fortes:${fen}`,
      prompt: `Toque nas casas fortes das brancas no campo das pretas (fileiras 5 e 6). ${countText(posts.length)}`,
      board: { fen },
      targets: posts,
      wrong: (sq) =>
        rankOf(sq) < 5
          ? "Procure no campo das pretas, nas fileiras 5 e 6."
          : `\`${sq}\` não serve: ou nenhum peão branco protege, ou um peão preto ainda pode atacar essa casa.`,
      success: "Casa protegida por peão e fora do alcance dos peões pretos: ninguém expulsa um cavalo dali.",
      mistakeNote: "Achar casas fortes",
    };
  }
  return null;
}

function knightToOutpost(): Screen | null {
  for (let guard = 0; guard < 400; guard++) {
    const pawns = randomPawns();
    const base = legalFen(withKings(pawns));
    if (!base) continue;
    const posts = outposts(base, "w").filter((s) => rankOf(s) >= 5);
    if (!posts.length) continue;
    const target = pick(posts);
    const from = pick(pieceDestinations("N", target, () => undefined).filter((s) => !pawns[s] && rankOf(s) <= 4));
    if (!from) continue;
    const fen = legalFen(withKings({ ...pawns, [from]: "N" }));
    if (!fen) continue;
    const ok = (m: { piece: string; to: string }) => m.piece === "n" && outposts(fen, "w").includes(m.to as Square);
    const moves = legalMoves(fen);
    const sol = moves.find((m) => ok(m));
    if (!sol || moves.every((m) => ok(m))) continue;
    return {
      kind: "move",
      key: `cavalo-casa-forte:${fen}`,
      prompt: "Leve o cavalo para uma casa forte no campo das pretas.",
      board: { fen, marks: { [from]: "focus" } },
      accept: (m) => ok(m),
      solution: uciOf(sol),
      wrong: (m) => (m.piece === "n" ? `\`${m.to}\` não é casa forte: falta a proteção de um peão ou um peão preto pode expulsar o cavalo.` : "Mova o cavalo."),
      success: "Cavalo na casa forte: forte, protegido e impossível de expulsar com peões.",
      mistakeNote: "Cavalo na casa forte",
    };
  }
  return null;
}

/* ---------- 10.4 peça boa e ruim ---------- */

function bishopRound(): Screen | null {
  for (let guard = 0; guard < 400; guard++) {
    const pawns = randomPawns();
    const whitePawns = (Object.entries(pawns) as [Square, string][]).filter(([, p]) => p === "P").map(([s]) => s);
    if (whitePawns.length < 5) continue;
    const bishopLight = Math.random() < 0.5;
    const sameColor = whitePawns.filter((s) => isLight(s) === bishopLight).length;
    const good = sameColor <= 2;
    const bad = sameColor >= 4;
    if (!good && !bad) continue;
    const sq = pick(ALL_SQUARES.filter((s) => !pawns[s] && isLight(s) === bishopLight && rankOf(s) <= 3));
    if (!sq) continue;
    const fen = legalFen(withKings({ ...pawns, [sq]: "B" }));
    if (!fen) continue;
    const color = bishopLight ? "claras" : "escuras";
    return {
      kind: "choice",
      key: `bispo-bom-ruim:${fen}`,
      prompt: `O bispo branco (em \`${sq}\`) é bom ou ruim?`,
      board: { fen, marks: { [sq]: "focus" } },
      options: [
        { id: "bom", label: "Bispo bom" },
        { id: "ruim", label: "Bispo ruim" },
      ],
      correct: good ? "bom" : "ruim",
      explain: `Dos ${whitePawns.length} peões brancos, ${sameColor} estão em casas ${color}, a mesma cor do bispo. ${good ? "Com poucos peões na cor dele, o bispo anda livre." : "Os próprios peões bloqueiam as diagonais dele."}`,
      mistakeNote: "Bispo bom ou ruim",
    };
  }
  return null;
}

function worstPiecePosition(): { fen: string; worst: Square; worstMob: number } | null {
  for (let guard = 0; guard < 400; guard++) {
    const pawns = randomPawns();
    const pieces: Pieces = { ...pawns };
    const types = ["R", "B", "N", "Q"];
    for (const t of types) {
      const sq = pick(ALL_SQUARES.filter((s) => !pieces[s] && rankOf(s) <= 3));
      if (!sq) break;
      pieces[sq] = t;
    }
    pieces[pick(ALL_SQUARES.filter((s) => !pieces[s] && rankOf(s) >= 6))!] = "n";
    const fen = legalFen(withKings(pieces));
    if (!fen) continue;
    const mine = (Object.entries(pieces) as [Square, string][]).filter(([, p]) => "RBNQ".includes(p)).map(([s]) => s);
    const mobs = mine.map((s) => ({ s, m: mobility(fen, s, "w") })).sort((a, b) => a.m - b.m);
    if (mobs.length < 4 || mobs[0].m > 3 || mobs[1].m - mobs[0].m < 3) continue;
    if (hangingPieces(fen, "w").length) continue;
    return { fen, worst: mobs[0].s, worstMob: mobs[0].m };
  }
  return null;
}

function worstTap(): Screen | null {
  const pos = worstPiecePosition();
  if (!pos) return null;
  const p = load(pos.fen).get(pos.worst)!;
  return {
    kind: "tap",
    key: `pior-peca:${pos.fen}`,
    prompt: "Toque na peça branca (sem contar rei e peões) com menos casas para ir.",
    board: { fen: pos.fen },
    targets: [pos.worst],
    wrong: (sq) => {
      const q = load(pos.fen).get(sq);
      if (!q || q.color !== "w" || q.type === "p" || q.type === "k") return "Toque em uma torre, bispo, cavalo ou dama branca.";
      return `${cap(ARTICLE[q.type])} ${NAME[q.type]} tem ${mobility(pos.fen, sq, "w")} lances possíveis. Procure a mais presa.`;
    },
    success: `${cap(ARTICLE[p.type])} ${NAME[p.type]} só tem ${pos.worstMob} ${pos.worstMob === 1 ? "lance" : "lances"}: é a pior peça das brancas.`,
    reveal: { [pos.worst]: "hint" },
    mistakeNote: "Achar a pior peça",
  };
}

/* ---------- 10.5 plano ---------- */

function improveWorst(): Screen | null {
  for (let guard = 0; guard < 30; guard++) {
    const pos = worstPiecePosition();
    if (!pos) continue;
    const ok = (m: { from: string; to: string; piece: string; promotion?: string }) => {
      if (m.from !== pos.worst) return false;
      const after = afterMove(pos.fen, m as never)!;
      if (hangingPieces(after.fen(), "w").length) return false;
      return mobility(after.fen(), m.to as Square, "w") >= pos.worstMob + 3;
    };
    const sol = legalMoves(pos.fen).find((m) => ok(m));
    if (!sol) continue;
    const p = load(pos.fen).get(pos.worst)!;
    return {
      kind: "move",
      key: `melhorar-peca:${pos.fen}`,
      prompt: "Sem ameaças no ar, melhore a sua pior peça (marcada): leve-a para uma casa mais ativa e segura.",
      board: { fen: pos.fen, marks: { [pos.worst]: "focus" } },
      accept: (m) => ok(m),
      solution: uciOf(sol),
      wrong: (m) =>
        m.from !== pos.worst
          ? `A peça que mais precisa de ajuda é ${ARTICLE[p.type]} ${NAME[p.type]} em \`${pos.worst}\`.`
          : "Essa casa não deixa a peça muito mais ativa, ou deixa algo sem proteção. Procure mais espaço.",
      success: "Peça ativa é peça que joga. Esse é o plano mais simples quando nada está acontecendo.",
      mistakeNote: "Melhorar a pior peça",
    };
  }
  return null;
}

function knightOrBishop(): Screen {
  return {
    kind: "choice",
    key: "casa-forte-peca",
    prompt: "Qual peça branca aproveita melhor a casa forte em `d5`?",
    board: { fen: "6k1/pp3ppp/3p4/2p5/2P5/8/PP3PPP/6K1 w - - 0 1", marks: { d5: "good" } },
    options: [
      { id: "cavalo", label: "Cavalo" },
      { id: "bispo", label: "Bispo" },
      { id: "torre", label: "Torre" },
    ],
    correct: "cavalo",
    explain: "O cavalo precisa chegar perto da ação para jogar, e dali ninguém o expulsa. O bispo e a torre atacam de longe, de qualquer casa.",
    mistakeNote: "A peça da casa forte",
  };
}

function isolatedPlan(): Screen {
  return {
    kind: "choice",
    key: "plano-isolado",
    prompt: "O peão preto de `d5` está isolado. Qual é o melhor plano contra ele?",
    board: { fen: "6k1/pp3ppp/8/3p4/8/8/PP3PPP/6K1 w - - 0 1", marks: { d5: "focus", d4: "good" } },
    options: [
      { id: "bloquear", label: "Colocar uma peça em d4, na frente dele" },
      { id: "trocar", label: "Trocar os outros peões" },
      { id: "avancar", label: "Avançar os peões do lado do rei" },
    ],
    correct: "bloquear",
    explain: "Com uma peça em `d4`, o peão fica parado. Nenhum peão preto pode expulsar essa peça, e o peão parado vira alvo.",
    mistakeNote: "Plano contra o peão isolado",
  };
}

function compact(list: (Screen | null)[]): Screen[] {
  return list.filter((s): s is Screen => Boolean(s));
}

export const lessonEstrutura: LessonDef = {
  id: "m10-l1",
  title: "Estrutura de peões",
  summary: "Peões isolados, dobrados e passados, e as ilhas de peões.",
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "O esqueleto da posição",
      text: "Os peões mudam devagar e decidem os planos. Olhe três tipos.",
      steps: [
        "**Isolado**: sem peões seus nas colunas vizinhas, como `a2`.",
        "**Dobrado**: dois na mesma coluna, como `c2` e `c3`.",
        "**Passado**: nenhum peão adversário na frente dele nem nas colunas vizinhas, como `d5`.",
      ],
      board: { fen: "6k1/pp4pp/8/3P4/8/2P5/P1P3PP/6K1 w - - 0 1" },
      demo: [
        { marks: { a2: "focus" }, area: ["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"] },
        { marks: { c2: "bad", c3: "bad" } },
        { marks: { d5: "good" }, area: ["c6", "c7", "c8", "d6", "d7", "d8", "e6", "e7", "e8"] },
      ],
    },
    ...compact([pawnKindRound("isolados"), pawnKindRound("dobrados"), pawnKindRound("passados")]),
    {
      kind: "explain",
      title: "O que fazer com cada um",
      text: "Cada tipo de peão pede um plano.",
      steps: [
        "Isolado: coloque uma peça na casa da frente dele. Ele fica parado e vira alvo.",
        "Dobrados: um tapa o outro, e nenhum protege o vizinho. Ataque-os.",
        "Passado: empurre. Cada casa que ele anda dá mais trabalho ao adversário.",
      ],
      board: { fen: "r4rk1/pp3ppp/4pn2/8/3P4/2N5/PP3PPP/R4RK1 b - - 0 1" },
      demo: [
        { moves: ["f6d5"], marks: { d4: "bad", d5: "good" } },
        { fen: "r5k1/pp3ppp/8/8/8/2P5/P1P2PPP/6K1 b - - 0 1", moves: ["a8c8"], arrows: [{ from: "c8", to: "c3" }], marks: { c2: "bad", c3: "bad" } },
        { fen: "6k1/pp4pp/8/3P4/8/8/P5PP/6K1 w - - 0 1", moves: ["d5d6", "g8f7", "d6d7", "f7e7"] },
      ],
    },
    isolatedPlan(),
    ...compact([islandsRound(), pawnKindRound(pick(["isolados", "dobrados", "passados"] as const))]),
  ],
};

export const lessonColunas: LessonDef = {
  id: "m10-l2",
  title: "Colunas abertas",
  summary: "Torres pertencem às colunas sem peões.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Colunas abertas",
      text: "Uma coluna **aberta** não tem peões. Torres adoram colunas abertas: dali atacam até o fundo do campo adversário.",
      board: { fen: "r4rk1/pp3ppp/8/8/8/8/PP3PPP/R4RK1 w - - 0 1" },
      steps: [
        "Leve uma torre para a coluna aberta antes do adversário.",
        "Coloque a outra torre na mesma coluna: uma protege a outra.",
        "Pela coluna, a torre chega na 7ª fileira, onde estão os peões dele.",
      ],
      demo: [
        { moves: ["a1d1", "a8c8"], area: ["d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8"] },
        { moves: ["d1d2", "g7g6", "f1d1"] },
        { moves: ["g8g7", "d2d7"], marks: { b7: "focus", f7: "focus" } },
      ],
      tip: "Coluna sem peões seus, mas com peão dele, é **semiaberta**: também serve para torres.",
    },
    ...compact([openFileChoice(), rookToOpenFile(), semiOpenChoice(), doubleRooks(), rookToOpenFile(), doubleRooks()]),
  ],
};

export const lessonCasasFortes: LessonDef = {
  id: "m10-l3",
  title: "Casas fortes",
  summary: "Casas no campo adversário onde nenhum peão consegue expulsar sua peça.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Casa forte",
      text: "Uma **casa forte** fica no campo adversário, é protegida por um peão seu e nenhum peão inimigo consegue atacá-la. É o lugar ideal para um cavalo.",
      board: { fen: "6k1/pp3ppp/3p4/2p5/2P5/4N3/PP3PPP/6K1 w - - 0 1" },
      steps: [
        "Ache uma casa no campo dele que nenhum peão preto consegue atacar. Aqui, `d5`: o peão de `c5` já passou, e não há peão preto na coluna `e`.",
        "Proteja essa casa com um peão seu.",
        "Leve um cavalo para lá.",
      ],
      demo: [
        { marks: { d5: "hint" } },
        { arrows: [{ from: "c4", to: "d5", tone: "good" }], marks: { d5: "good" } },
        { moves: ["e3d5"], marks: { d5: "good" } },
      ],
    },
    ...compact([outpostTap(), knightToOutpost(), knightOrBishop(), outpostTap(), knightToOutpost(), knightToOutpost()]),
  ],
};

export const lessonPecaBoaRuim: LessonDef = {
  id: "m10-l4",
  title: "Peça boa e peça ruim",
  summary: "Peças presas atrás dos próprios peões jogam pouco.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Bispo bom, bispo ruim",
      text: "O valor de um bispo depende de onde estão os seus peões.",
      steps: [
        "Os peões brancos de `d4` e `e5` estão em casas escuras.",
        "O bispo de `c3` também anda nas escuras, e os próprios peões tampam o caminho: só 6 casas. É um bispo **ruim**.",
        "Um bispo das casas claras, com esses mesmos peões, tem as diagonais livres: 11 casas. É um bispo **bom**.",
      ],
      board: { fen: "6k1/5ppp/4p3/3pP3/3P4/2B5/5PPP/6K1 w - - 0 1" },
      demo: [
        { marks: { d4: "focus", e5: "focus" } },
        { area: ["b4", "a5", "d2", "e1", "b2", "a1"], marks: { c3: "bad" } },
        { fen: "6k1/5ppp/4p3/3pP3/3P4/3B4/5PPP/6K1 w - - 0 1", area: ["e4", "f5", "g6", "h7", "c4", "b5", "a6", "e2", "f1", "c2", "b1"], marks: { d3: "good" } },
      ],
    },
    ...compact([bishopRound(), bishopRound(), bishopRound()]),
    {
      kind: "explain",
      title: "Consertar uma peça ruim",
      text: "Uma peça ruim tem conserto.",
      steps: [
        "Bispo ruim: mude seus peões para a outra cor, ou troque o bispo. Aqui, `Bb4` oferece a troca pelo bispo preto.",
        "Qualquer peça presa: leve-a para fora da corrente de peões, onde ela tenha casas. Em `g5`, o mesmo bispo alcança 9.",
      ],
      board: { fen: "6k1/4bppp/4p3/3pP3/3P4/2B5/5PPP/6K1 w - - 0 1" },
      demo: [
        { moves: ["c3b4"], arrows: [{ from: "b4", to: "e7", tone: "hint" }] },
        { fen: "6k1/5ppp/4p3/3pP3/3P4/2B5/5PPP/6K1 w - - 0 1", moves: ["c3d2", "g8f8", "d2g5"], area: ["h6", "f6", "e7", "d8", "h4", "f4", "e3", "d2", "c1"] },
      ],
    },
    ...compact([worstTap(), worstTap(), improveWorst()]),
  ],
};

export const lessonPlano: LessonDef = {
  id: "m10-l5",
  title: "Montando um plano",
  summary: "Quando nada está acontecendo, melhore a pior peça.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Sem ameaças, um plano",
      text: "Quando o checklist não acha nada urgente, siga este roteiro.",
      steps: [
        "Olhe os peões: onde há colunas abertas e casas fortes? Aqui, a coluna `e` e a casa `d5`.",
        "Ache a sua pior peça: a que tem menos casas para ir. O cavalo de `b1` tem 3.",
        "Leve essa peça para uma casa ativa: coluna aberta, casa forte ou diagonal livre.",
        "Troque as peças adversárias que mais atrapalham você, como a torre preta na coluna `e`.",
      ],
      board: { fen: "r4rk1/pp3ppp/3p4/2p5/2P5/8/PP3PPP/RN3RK1 w - - 0 1" },
      demo: [
        { area: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"], marks: { d5: "good" } },
        { area: ["a3", "c3", "d2"], marks: { b1: "bad" } },
        { moves: ["b1c3", "a8e8", "c3d5"], marks: { d5: "good" } },
        { moves: ["g7g6", "f1e1"], arrows: [{ from: "e1", to: "e8" }] },
      ],
      tip: "Um lance, uma melhoria. Comece pela peça pior.",
    },
    ...compact([worstTap(), improveWorst(), rookToOpenFile(), improveWorst(), worstTap(), improveWorst()]),
  ],
};
