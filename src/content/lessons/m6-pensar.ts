import { countText } from "@/content/lib/text";
import type { LessonDef, Screen } from "@/content/types";
import MATES from "@/content/data/mates.json";
import { ARTICLE, NAME, VALUE, hangingPieces, loosePieces, piecesOf } from "@/content/lib/analysis";
import { afterMove, boardFor, mateMoves, randomVariant, withRandomKings } from "@/content/lib/positions";
import { legalMoves, load, pieceDestinations, uciOf } from "@/lib/chess/game";
import { ALL_SQUARES, fileIndex, rankOf, toSquare, type Square } from "@/lib/chess/squares";
import { pick, pickDistinct, shuffle } from "@/lib/random";
import { puzzleRounds } from "@/content/lib/puzzles";

type Pieces = Partial<Record<Square, string>>;
const INNER = ALL_SQUARES.filter((s) => rankOf(s) >= 2 && rankOf(s) <= 7);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function scatter(pieces: Pieces, list: string[]): boolean {
  for (const p of list) {
    const free = INNER.filter((s) => !pieces[s]);
    if (!free.length) return false;
    pieces[pick(free)] = p;
  }
  return true;
}

/* ---------- threat after the opponent's move ---------- */

interface Threat {
  fen: string;
  from: Square;
  to: Square;
  target: Square;
  attacker: string;
  victim: string;
}

/** Squares from which a black piece of type `a` attacks `t`. */
function attackSquares(a: string, t: Square, occ: (s: Square) => string | undefined): Square[] {
  if (a === "p") {
    return [-1, 1]
      .map((d) => toSquare(fileIndex(t) + d, rankOf(t) + 1))
      .filter((s): s is Square => !!s && rankOf(s) <= 7);
  }
  // Knights and sliders attack symmetrically.
  return pieceDestinations(a, t, occ).filter((s) => !occ(s));
}

function makeThreat(): Threat | null {
  for (let guard = 0; guard < 400; guard++) {
    const victim = pick(["n", "b", "r", "q"]);
    const attacker = pick(["p", "n", "b", "r"].filter((a) => VALUE[a] < VALUE[victim] || a === "n"));
    const pieces: Pieces = {};
    const target = pick(INNER);
    pieces[target] = victim.toUpperCase();
    if (!scatter(pieces, [pick(["P", "N", "B"]), "P"])) continue;
    if (!scatter(pieces, [pick(["p", "n", "b", "r"]), "p"])) continue;
    const occ = (s: Square) => pieces[s];
    const to = pick(attackSquares(attacker, target, occ).filter((s) => !pieces[s]));
    if (!to) continue;
    let from: Square | undefined;
    if (attacker === "p") {
      const one = toSquare(fileIndex(to), rankOf(to) + 1);
      from = one && !pieces[one] && rankOf(one) <= 7 ? one : undefined;
    } else {
      from = pick(
        pieceDestinations(attacker, to, occ).filter((s) => !pieces[s] && !attackSquares(attacker, target, (x) => (x === to ? undefined : pieces[x])).includes(s)),
      );
    }
    if (!from) continue;
    const after: Pieces = { ...pieces, [to]: attacker };
    const fen = withRandomKings(after, "w", (f) => {
      if (load(f).isCheck()) return false;
      const hang = hangingPieces(f, "w");
      if (hang.length !== 1 || hang[0].sq !== target) return false;
      // Before the move, nothing was hanging: the threat is new.
      const b = load(f);
      b.remove(to);
      b.put({ type: attacker as "p", color: "b" }, from!);
      if (hangingPieces(b.fen(), "w").length) return false;
      // There must be a way to save the piece.
      return legalMoves(f).some((m) => hangingPieces(afterMove(f, m)!.fen(), "w").length === 0);
    });
    if (!fen) continue;
    return { fen, from, to, target, attacker, victim };
  }
  return null;
}

function threatPair(): Screen[] {
  const t = makeThreat();
  if (!t) return [];
  const saving = legalMoves(t.fen).find((m) => hangingPieces(afterMove(t.fen, m)!.fen(), "w").length === 0)!;
  return [
    {
      kind: "tap",
      key: `ameaca:${t.fen}`,
      prompt: "As pretas acabaram de jogar (lance marcado). Toque na sua peça que ficou ameaçada.",
      board: { fen: t.fen, lastMove: [t.from, t.to] },
      targets: [t.target],
      wrong: (sq) => {
        const p = load(t.fen).get(sq);
        if (!p || p.color !== "w") return "Toque em uma das suas peças (as brancas).";
        return `${cap(ARTICLE[p.type])} ${NAME[p.type]} em \`${sq}\` está segura. Veja o que a peça que acabou de mexer passou a atacar.`;
      },
      success: `${cap(ARTICLE[t.attacker])} ${NAME[t.attacker]} que foi para \`${t.to}\` ataca ${ARTICLE[t.victim]} ${NAME[t.victim]} em \`${t.target}\`.`,
      reveal: { [t.target]: "hint", [t.to]: "soft" },
      mistakeNote: "Ver a ameaça do adversário",
    },
    {
      kind: "move",
      key: `salvar:${t.fen}`,
      prompt: "Agora salve a peça: tire do ataque ou proteja, sem deixar outra peça sua solta.",
      board: { fen: t.fen, lastMove: [t.from, t.to], marks: { [t.target]: "focus" } },
      accept: (_m, after) => hangingPieces(after.fen(), "w").length === 0,
      solution: uciOf(saving),
      wrong: (m) => {
        const h = hangingPieces(afterMove(t.fen, m)!.fen(), "w");
        return `Depois de \`${m.san}\`, ${ARTICLE[h[0].type]} ${NAME[h[0].type]} em \`${h[0].sq}\` ainda pode ser capturad${ARTICLE[h[0].type]} com lucro.`;
      },
      success: "Peça salva. Esse é o primeiro passo do checklist.",
      mistakeNote: "Reagir à ameaça",
    },
  ];
}

/* ---------- checks, captures, threats ---------- */

function checkersRound(): Screen | null {
  for (let guard = 0; guard < 300; guard++) {
    const pieces: Pieces = {};
    if (!scatter(pieces, pickDistinct(["Q", "R", "B", "N", "R", "B"], 4))) continue;
    if (!scatter(pieces, ["p", "p"])) continue;
    const fen = withRandomKings(pieces, "w", (f) => !load(f).isCheck());
    if (!fen) continue;
    const moves = legalMoves(fen);
    const checkers = [...new Set(moves.filter((m) => afterMove(fen, m)!.isCheck()).map((m) => m.from as Square))];
    const white = piecesOf(fen, "w").filter((p) => p.type !== "k");
    if (checkers.length < 1 || checkers.length > 3 || checkers.length === white.length) continue;
    return {
      kind: "tapAll",
      key: `quem-da-xeque:${fen}`,
      prompt: `Xeques primeiro: toque em todas as suas peças que podem dar xeque agora. ${countText(checkers.length)}`,
      board: { fen },
      targets: checkers,
      wrong: (sq) => {
        const p = load(fen).get(sq);
        return p && p.color === "w" ? `${cap(ARTICLE[p.type])} ${NAME[p.type]} em \`${sq}\` não consegue atacar o rei neste lance.` : "Toque só nas suas peças.";
      },
      success: "Olhar todos os xeques é o jeito mais rápido de achar golpes.",
      mistakeNote: "Encontrar os xeques",
    };
  }
  return null;
}

function capturesRound(): Screen | null {
  for (let guard = 0; guard < 300; guard++) {
    const pieces: Pieces = {};
    if (!scatter(pieces, pickDistinct(["Q", "R", "B", "N", "R", "B"], 3))) continue;
    if (!scatter(pieces, pickDistinct(["q", "r", "b", "n", "p", "p"], 4))) continue;
    const fen = withRandomKings(pieces, "w", (f) => !load(f).isCheck());
    if (!fen) continue;
    const targets = [...new Set(legalMoves(fen).filter((m) => m.captured && m.captured !== "k").map((m) => m.to as Square))];
    const black = piecesOf(fen, "b").filter((p) => p.type !== "k");
    if (targets.length < 1 || targets.length > 3 || targets.length === black.length) continue;
    return {
      kind: "tapAll",
      key: `capturas:${fen}`,
      prompt: `Capturas: toque em todas as peças pretas que você pode capturar agora. ${countText(targets.length)}`,
      board: { fen },
      targets,
      wrong: (sq) => {
        const p = load(fen).get(sq);
        return p && p.color === "b" ? `Nenhuma peça sua alcança \`${sq}\` neste lance.` : "Toque nas peças pretas.";
      },
      success: "Depois dos xeques, as capturas. Assim nada passa despercebido.",
      mistakeNote: "Encontrar as capturas",
    };
  }
  return null;
}

/** Exactly one black piece can be won; other captures are bad or absent. */
function freePieceRound(key: string, prompt: string): Screen | null {
  for (let guard = 0; guard < 400; guard++) {
    const pieces: Pieces = {};
    if (!scatter(pieces, pickDistinct(["Q", "R", "B", "N", "R"], 3))) continue;
    if (!scatter(pieces, pickDistinct(["r", "b", "n", "p", "p", "q"], 4))) continue;
    const fen = withRandomKings(pieces, "w", (f) => {
      if (load(f).isCheck()) return false;
      const hang = hangingPieces(f, "b");
      return hang.length === 1 && hangingPieces(f, "w").length === 0;
    });
    if (!fen) continue;
    const prize = hangingPieces(fen, "b")[0];
    const win = legalMoves(fen).find((m) => m.to === prize.sq);
    if (!win) continue;
    return {
      kind: "move",
      key: `${key}:${fen}`,
      prompt,
      board: { fen },
      accept: (m) => m.to === prize.sq,
      solution: uciOf(win),
      wrong: (m) =>
        m.captured
          ? `Capturar em \`${m.to}\` não ganha nada: a peça estava protegida. Procure uma peça solta.`
          : `\`${m.san}\` não ganha material. Tem uma peça preta solta esperando.`,
      success: `${cap(ARTICLE[prize.type])} ${NAME[prize.type]} em \`${prize.sq}\` estava solt${ARTICLE[prize.type]}: ganho de ${VALUE[prize.type]}.`,
      mistakeNote: "Capturar a peça solta",
    };
  }
  return null;
}

/**
 * A quiet threat: no capture and no check, and after it a black piece can be
 * won while none of yours can. Nothing hangs before the move.
 */
function threatRound(key: string, prompt: string): Screen | null {
  for (let guard = 0; guard < 400; guard++) {
    const pieces: Pieces = {};
    if (!scatter(pieces, pickDistinct(["Q", "R", "B", "N", "R", "B", "N"], 3))) continue;
    if (!scatter(pieces, pickDistinct(["r", "b", "n", "q", "p", "p"], 3))) continue;
    const fen = withRandomKings(pieces, "w", (f) => !load(f).isCheck() && !hangingPieces(f, "b").length && !hangingPieces(f, "w").length);
    if (!fen) continue;
    const quiet = legalMoves(fen).filter((m) => !m.captured && !afterMove(fen, m)!.isCheck());
    const threatens = (m: Parameters<typeof afterMove>[1]) => {
      const after = afterMove(fen, m)!.fen();
      return hangingPieces(after, "b").length > 0 && hangingPieces(after, "w").length === 0;
    };
    const good = quiet.filter(threatens);
    if (!good.length || good.length > 4) continue;
    return {
      kind: "move",
      key: `${key}:${fen}`,
      prompt,
      board: { fen },
      accept: (m) => !m.captured && !afterMove(fen, m)!.isCheck() && threatens(m),
      solution: uciOf(good[0]),
      wrong: (m) => {
        if (m.captured) return "Essa captura não ganha nada. Procure um lance que ataque uma peça dele.";
        if (afterMove(fen, m)!.isCheck()) return "Esse xeque não ganha nada. Procure um lance que ataque uma peça.";
        const mine = hangingPieces(afterMove(fen, m)!.fen(), "w");
        if (mine.length) return `Depois de \`${m.san}\`, quem fica em perigo é ${ARTICLE[mine[0].type]} sua ${NAME[mine[0].type]} em \`${mine[0].sq}\`.`;
        return `\`${m.san}\` não ataca nenhuma peça que ele precise salvar.`;
      },
      success: (m) => {
        const hit = hangingPieces(afterMove(fen, m)!.fen(), "b")[0];
        return `Agora ${ARTICLE[hit.type]} ${NAME[hit.type]} em \`${hit.sq}\` está em perigo, e ele gasta o próximo lance para salvar.`;
      },
      mistakeNote: "Achar uma ameaça",
    };
  }
  return null;
}

/* ---------- loose pieces ---------- */

function looseRound(color: "w" | "b"): Screen | null {
  for (let guard = 0; guard < 300; guard++) {
    const pieces: Pieces = {};
    const mine = color === "w" ? ["Q", "R", "B", "N", "P", "P", "R"] : ["q", "r", "b", "n", "p", "p", "r"];
    const theirs = color === "w" ? ["r", "b", "p"] : ["R", "B", "P"];
    if (!scatter(pieces, pickDistinct(mine, 5))) continue;
    if (!scatter(pieces, pickDistinct(theirs, 2))) continue;
    const fen = withRandomKings(pieces, "w", (f) => !load(f).isCheck());
    if (!fen) continue;
    const loose = loosePieces(fen, color).map((p) => p.sq);
    if (loose.length < 1 || loose.length > 3) continue;
    const side = color === "w" ? "suas peças (brancas)" : "peças pretas";
    return {
      kind: "tapAll",
      key: `soltas:${color}:${fen}`,
      prompt: `Toque em todas as ${side} que estão soltas, sem nenhuma proteção. ${countText(loose.length)}`,
      board: { fen },
      targets: loose,
      wrong: (sq) => {
        const p = load(fen).get(sq);
        if (!p || p.color !== color) return `Olhe só as ${side}.`;
        return `${cap(ARTICLE[p.type])} ${NAME[p.type]} em \`${sq}\` tem proteção de outra peça.`;
      },
      success: color === "w" ? "Peças soltas são o alvo favorito do adversário. Proteja-as." : "Peças soltas do adversário são alvos para você.",
      mistakeNote: color === "w" ? "Ver suas peças soltas" : "Ver peças soltas do adversário",
    };
  }
  return null;
}

/** One of your pieces is loose (not yet attacked): protect it without loosening another. */
function protectLooseRound(): Screen | null {
  for (let guard = 0; guard < 400; guard++) {
    const pieces: Pieces = {};
    if (!scatter(pieces, pickDistinct(["Q", "R", "B", "N", "P", "P", "R"], 4))) continue;
    if (!scatter(pieces, pickDistinct(["r", "b", "n", "p"], 2))) continue;
    const fen = withRandomKings(pieces, "w", (f) => !load(f).isCheck() && loosePieces(f, "w").length === 1 && !hangingPieces(f, "w").length);
    if (!fen) continue;
    const loose = loosePieces(fen, "w")[0];
    const ok = (m: Parameters<typeof afterMove>[1]) => {
      const after = afterMove(fen, m)!.fen();
      return loosePieces(after, "w").length === 0 && hangingPieces(after, "w").length === 0;
    };
    const moves = legalMoves(fen);
    const good = moves.filter(ok);
    if (!good.length || good.length === moves.length) continue;
    return {
      kind: "move",
      key: `proteger-solta:${fen}`,
      prompt: "Uma peça sua está solta. Deixe todas protegidas.",
      board: { fen },
      accept: (m) => ok(m),
      solution: uciOf(good[0]),
      wrong: (m) => {
        const left = loosePieces(afterMove(fen, m)!.fen(), "w")[0];
        return left
          ? `Depois de \`${m.san}\`, ${ARTICLE[left.type]} ${NAME[left.type]} em \`${left.sq}\` continua sem proteção.`
          : `Depois de \`${m.san}\`, uma peça sua pode ser capturada com lucro.`;
      },
      success: `${cap(ARTICLE[loose.type])} ${NAME[loose.type]} de \`${loose.sq}\` não está mais sozinh${ARTICLE[loose.type]}.`,
      mistakeNote: "Proteger a peça solta",
    };
  }
  return null;
}

/* ---------- checklist puzzles ---------- */

const DEFEND_MATE = ["3r2k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1", "2r3k1/5ppp/8/8/8/1Q6/5PPP/6K1 w - - 0 1"];

function checklistPuzzles(): Screen[] {
  const out: Screen[] = [];
  // 1) stop a mate threat
  const dm = randomVariant(pick(DEFEND_MATE));
  const safe = legalMoves(dm).find((m) => mateMoves(afterMove(dm, m)!.fen()).length === 0)!;
  out.push({
    kind: "move",
    key: `checklist-mate-ameacado:${dm}`,
    prompt: "Use o checklist. Qual é o lance certo aqui?",
    board: boardFor(dm),
    accept: (_m, after) => mateMoves(after.fen()).length === 0,
    solution: uciOf(safe),
    wrong: (m) => `Passo 1 do checklist: o adversário ameaça mate. Depois de \`${m.san}\` vem \`${mateMoves(afterMove(dm, m)!.fen())[0].san}\`.`,
    success: "Primeiro a defesa: nenhum ataque vale se você levar mate.",
    mistakeNote: "Checklist: defender ameaça de mate",
  });
  // 2) a mate for you
  const mt = randomVariant(pick([...MATES.kq1, ...MATES.kr1]), (f) => mateMoves(f).length > 0);
  out.push({
    kind: "move",
    key: `checklist-mate:${mt}`,
    prompt: "Use o checklist. Qual é o melhor lance aqui?",
    board: boardFor(mt),
    accept: (_m, after) => after.isCheckmate(),
    solution: uciOf(mateMoves(mt)[0]),
    wrong: (m) => `Passo 2: olhe os xeques. \`${m.san}\` não termina a partida, e existe um xeque que termina.`,
    success: "Xeque-mate. Os xeques vêm primeiro na busca.",
    mistakeNote: "Checklist: achar o mate",
  });
  // 3) a free piece
  const fp = freePieceRound("checklist-peca-solta", "Use o checklist. Qual é o melhor lance aqui?");
  if (fp) out.push(fp);
  // 4) save your piece
  const tp = threatPair();
  if (tp[1]) out.push({ ...tp[1], prompt: "Use o checklist. O adversário acabou de jogar: qual é o melhor lance?" } as Screen);
  // 5) another free piece, 6) a threat when nothing can be taken
  const fp2 = freePieceRound("checklist-peca-solta", "Use o checklist. Qual é o melhor lance aqui?");
  if (fp2) out.push(fp2);
  const th = threatRound("checklist-ameaca", "Use o checklist. Nada para capturar: qual lance cria uma ameaça?");
  if (th) out.push(th);
  return shuffle(out);
}

/* ---------- lessons ---------- */

export const lessonAmeaca: LessonDef = {
  id: "m6-l1",
  title: "O que o adversário ameaça?",
  summary: "Antes de pensar no seu plano, veja o que o último lance dele quer.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "A primeira pergunta",
      text: "Muita peça se perde porque ninguém olhou o último lance do adversário. Antes de jogar, pergunte:",
      steps: ["Para onde a peça dele foi?", "O que ela ataca agora?", "O que ela deixou de defender?", "Ele ameaça mate?"],
      board: { fen: "6k1/5ppp/8/8/3N4/2b5/5PPP/6K1 w - - 0 1", lastMove: ["a5", "c3"], arrows: [{ from: "c3", to: "d4" }], marks: { d4: "focus" } },
      tip: "Achou a ameaça? Defenda sem deixar outra peça sua sozinha.",
    },
    ...threatPair(),
    ...threatPair(),
    ...threatPair(),
  ],
};

export const lessonCCT: LessonDef = {
  id: "m6-l2",
  title: "Xeques, capturas e ameaças",
  summary: "Procure seus lances fortes nessa ordem: xeques, capturas, ameaças.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "Os lances forçados",
      text: "Na sua vez, comece pelos lances que obrigam o adversário a responder. Eles deixam pouca escolha para ele, e é neles que aparecem os golpes.",
      steps: ["Xeques: quais peças suas podem dar xeque?", "Capturas: o que dá para capturar, saindo no lucro?", "Ameaças: que lance ataca uma peça dele?"],
    },
    ...([checkersRound(), capturesRound(), freePieceRound("cct-ganho", "Uma captura ganha material de graça. Encontre-a."), capturesRound()].filter(Boolean) as Screen[]),
    {
      kind: "explain",
      title: "Ameaças",
      text: "Sem xeque e sem captura boa, procure uma **ameaça**: um lance que ataca uma peça que ele não pode deixar cair. Ou ela está sem defesa, ou vale mais que a peça que ataca.",
      board: { fen: "6k1/5ppp/2n5/8/8/8/5PPP/5BK1 w - - 0 1", arrows: [{ from: "f1", to: "b5", tone: "good" }, { from: "b5", to: "c6" }], marks: { c6: "focus" } },
      tip: "Uma boa ameaça não deixa nenhuma peça sua sozinha.",
    },
    ...([threatRound("cct-ameaca", "Nada para capturar. Faça um lance que ameace ganhar uma peça."), threatRound("cct-ameaca", "Faça um lance que ameace ganhar uma peça.")].filter(Boolean) as Screen[]),
  ],
};

export const lessonSoltas: LessonDef = {
  id: "m6-l3",
  title: "Peças soltas",
  summary: "Peça sem proteção é o alvo número um das táticas.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "Peças soltas",
      text: "Uma peça **solta** não tem nenhuma outra protegendo. Ainda não está perdida, mas basta um ataque. O grande mestre John Nunn resumiu assim: peça solta cai.",
      board: { fen: "6k1/5ppp/2n5/8/8/2B5/5PPP/6K1 w - - 0 1", marks: { c6: "focus", c3: "focus" } },
      tip: "Aqui o cavalo preto e o bispo branco estão soltos.",
    },
    ...([looseRound("b"), looseRound("w")].filter(Boolean) as Screen[]),
    ...([freePieceRound("solta-captura", "Capture uma peça solta que você ataca.")].filter(Boolean) as Screen[]),
    ...puzzleRounds("hangingPiece", 1, {
      lookFor: "a peça solta desta partida de verdade",
      hint: "Qual peça dele ninguém protege?",
      success: "Peça solta, peça ganha.",
      note: "Capturar a peça solta",
    }),
    {
      kind: "explain",
      title: "Como consertar",
      text: "Achou uma peça sua solta? Três jeitos de resolver:",
      steps: ["Proteja com outra peça.", "Leve a peça para uma casa protegida.", "Troque-a por uma peça dele."],
    },
    ...([protectLooseRound(), protectLooseRound(), looseRound("b")].filter(Boolean) as Screen[]),
  ],
};

export const lessonChecklist: LessonDef = {
  id: "m6-l4",
  title: "O checklist completo",
  summary: "Quatro perguntas antes de cada lance.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "O checklist",
      text: "Faça estas perguntas antes de cada lance. Com o tempo, vira hábito e fica rápido.",
      tip: "A ordem importa: primeiro se defender, depois atacar.",
      steps: [
        "O que o último lance do adversário ameaça?",
        "Tenho xeques, capturas ou ameaças fortes?",
        "Alguma peça minha está solta ou atacada?",
        "Se nada disso: qual lance melhora a minha pior peça?",
      ],
    },
    ...checklistPuzzles(),
  ],
};

