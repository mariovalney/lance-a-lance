import { countText } from "@/content/lib/text";
import type { LessonDef, Screen } from "@/content/types";
import { ARTICLE, NAME, hangingPieces } from "@/content/lib/analysis";
import { afterMove, isLegalPosition, placementToFen } from "@/content/lib/positions";
import {
  doubledPawns,
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
      text: "Os peões mudam devagar e decidem os planos. Três tipos importam: **isolado** (sem peões vizinhos), **dobrado** (dois na mesma coluna) e **passado** (nenhum peão adversário pode pará-lo).",
      board: {
        fen: "6k1/pp4pp/8/3P4/8/2P5/P1P3PP/6K1 w - - 0 1",
        marks: { d5: "good", c3: "bad", c2: "bad", a2: "soft" },
      },
      tip: "Aqui: `d5` é passado, `c2` e `c3` são dobrados, `a2` é isolado.",
    },
    ...compact([pawnKindRound("isolados"), pawnKindRound("dobrados"), pawnKindRound("passados"), islandsRound()]),
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
      board: { fen: "r5k1/pp3ppp/8/8/8/8/PP3PPP/3R2K1 w - - 0 1", arrows: [{ from: "d1", to: "d8" }], marks: { d8: "soft" } },
      tip: "Coluna só sem peões seus (com peão adversário) é **semiaberta**, também boa para torres.",
    },
    ...compact([openFileChoice(), rookToOpenFile(), rookToOpenFile()]),
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
      board: { fen: "6k1/pp3ppp/3p4/2pN4/2P5/8/PP3PPP/6K1 w - - 0 1", marks: { d5: "good" }, arrows: [{ from: "c4", to: "d5", tone: "good" }] },
    },
    ...compact([outpostTap(), knightToOutpost(), knightToOutpost()]),
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
      text: "Um bispo com muitos peões seus em casas da mesma cor fica **ruim**: os próprios peões bloqueiam as diagonais. Com os peões na outra cor, ele é um bispo **bom**.",
      board: { fen: "6k1/5ppp/4p3/3pP3/3P4/2B5/5PPP/6K1 w - - 0 1", marks: { c3: "bad", d4: "soft", e5: "soft" } },
    },
    ...compact([bishopRound(), bishopRound(), worstTap(), worstTap()]),
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
      text: "Quando o checklist não acha nada urgente, siga este roteiro simples:",
      steps: [
        "Olhe os peões: onde há colunas abertas e casas fortes?",
        "Ache a sua pior peça: a que tem menos casas para ir.",
        "Leve essa peça para uma casa ativa: coluna aberta, casa forte ou diagonal livre.",
        "Troque as peças adversárias que mais atrapalham você.",
      ],
    },
    ...compact([worstTap(), improveWorst(), improveWorst()]),
  ],
};
