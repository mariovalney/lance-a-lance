import type { BoardSpec, LessonDef, Screen } from "@/content/types";
import { puzzleBoard, puzzleScreen, puzzlesOf, type Puzzle, type PuzzleTheme } from "@/content/lib/puzzles";
import { load } from "@/lib/chess/game";
import { readMove } from "@/lib/chess/notation";
import type { Square } from "@/lib/chess/squares";
import { pickDistinct } from "@/lib/random";

interface TacticSpec {
  id: string;
  title: string;
  summary: string;
  theme: PuzzleTheme;
  concept: string;
  board: BoardSpec | "first-puzzle";
  tipTitle: string;
  tip: string;
  /** How to set the tactic up, in order. */
  steps: string[];
  lookFor: string;
  hint: string;
  success: string;
}

function exampleBoard(spec: TacticSpec): { board: BoardSpec; skip: number } {
  if (spec.board !== "first-puzzle") return { board: spec.board, skip: 0 };
  const p = puzzlesOf(spec.theme)[0];
  const first = p.line[0];
  return {
    board: puzzleBoard(p, { arrows: [{ from: first.slice(0, 2) as never, to: first.slice(2, 4) as never, tone: "good" }] }),
    skip: 1,
  };
}

/** Before playing a puzzle: tap the piece that starts the blow. */
function strikeTap(spec: TacticSpec, p: Puzzle): Screen {
  const from = p.line[0].slice(0, 2) as Square;
  const move = load(p.fen).move({ from, to: p.line[0].slice(2, 4), promotion: p.line[0][4] });
  return {
    kind: "tap",
    key: `golpe:${spec.theme}:${p.id}`,
    prompt: "Antes de jogar: toque na peça que começa o golpe.",
    board: puzzleBoard(p),
    targets: [from],
    wrong: () => `O golpe não começa por essa peça. ${spec.hint}`,
    success: `O golpe começa com \`${move.san}\` (${readMove(move)}).`,
    reveal: { [from]: "hint" },
    mistakeNote: spec.title,
  };
}

function tacticLesson(spec: TacticSpec): LessonDef {
  return {
    id: spec.id,
    title: spec.title,
    summary: spec.summary,
    minutes: 6,
    build: () => {
      const { board, skip } = exampleBoard(spec);
      const opts = { lookFor: spec.lookFor, hint: spec.hint, success: spec.success, note: spec.title, skip };
      const [first, ...rest] = pickDistinct(puzzlesOf(spec.theme).slice(skip), 7);
      const rounds = rest.map((p) => puzzleScreen(spec.theme, p, opts));
      const screens: Screen[] = [
        { kind: "explain", title: spec.title, text: spec.concept, board },
        strikeTap(spec, first),
        ...rounds.slice(0, 3),
        { kind: "explain", title: spec.tipTitle, text: spec.tip, steps: spec.steps },
        ...rounds.slice(3),
      ];
      return screens;
    },
  };
}

export const lessonGarfo = tacticLesson({
  id: "m8-l1",
  title: "Garfo",
  summary: "Uma peça ataca duas ao mesmo tempo.",
  theme: "fork",
  concept: "No **garfo**, uma peça ataca duas peças adversárias de uma vez. O adversário só consegue salvar uma. O cavalo é o rei dos garfos.",
  board: { fen: "r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1", arrows: [{ from: "d5", to: "c7", tone: "good" }], marks: { a8: "focus", e8: "focus" } },
  tipTitle: "Como montar um garfo",
  tip: "Garfo não aparece do nada. Procure assim:",
  steps: [
    "Ache duas peças dele sem defesa, ou o rei e outra peça.",
    "Procure uma casa de onde uma peça sua ataca as duas.",
    "Confira se essa casa é segura para a sua peça.",
  ],
  lookFor: "um garfo",
  hint: "Procure um lance que ataque duas peças ao mesmo tempo.",
  success: "Garfo! Uma das peças atacadas vai cair.",
});

export const lessonCravada = tacticLesson({
  id: "m8-l2",
  title: "Cravada",
  summary: "A peça da frente não pode sair sem expor uma mais valiosa.",
  theme: "pin",
  concept: "Na **cravada**, uma peça fica presa porque, se sair, expõe uma peça mais valiosa atrás dela. Se atrás estiver o rei, ela nem pode se mexer.",
  board: { fen: "4k3/8/2n5/8/B7/8/8/4K3 w - - 0 1", arrows: [{ from: "a4", to: "e8" }], marks: { c6: "focus", e8: "soft" } },
  tipTitle: "Como usar a cravada",
  tip: "Peça cravada quase não se mexe. Use isso:",
  steps: [
    "Ache uma peça dele na frente do rei ou da dama, na mesma linha.",
    "Mire essa linha com uma torre, um bispo ou a dama.",
    "Ataque a peça cravada de novo, de preferência com um peão: ela não tem como fugir.",
  ],
  lookFor: "uma cravada (ou um jeito de aproveitar uma)",
  hint: "Procure uma peça adversária presa na frente do rei ou de uma peça valiosa.",
  success: "A peça cravada não conseguiu escapar.",
});

export const lessonEspeto = tacticLesson({
  id: "m8-l3",
  title: "Espeto",
  summary: "Ataque a peça valiosa da frente e capture a de trás.",
  theme: "skewer",
  concept: "O **espeto** é o contrário da cravada: a peça mais valiosa está na frente. Ela é obrigada a sair, e você captura a peça que estava atrás.",
  board: { fen: "4q3/8/4k3/8/8/8/8/4R1K1 b - - 0 1", arrows: [{ from: "e1", to: "e8" }], marks: { e6: "focus", e8: "focus" } },
  tipTitle: "Como montar um espeto",
  tip: "O espeto aparece quando as peças dele se alinham:",
  steps: [
    "Ache duas peças dele na mesma linha, com a mais valiosa na frente.",
    "Ataque a da frente com uma torre, um bispo ou a dama.",
    "Quando ela sair, capture a de trás.",
  ],
  lookFor: "um espeto",
  hint: "Procure duas peças alinhadas, com a mais valiosa na frente.",
  success: "Espeto! A peça de trás ficou sem proteção.",
});

export const lessonDescoberto = tacticLesson({
  id: "m8-l4",
  title: "Ataque descoberto",
  summary: "Uma peça sai da frente e revela o ataque de outra.",
  theme: "discoveredAttack",
  concept: "No **ataque descoberto**, uma peça sai da frente de outra e revela um ataque. Se a peça que saiu também ameaça algo, são duas ameaças de uma vez.",
  board: {
    fen: "4q1k1/7p/8/8/4B3/8/8/4R1K1 w - - 0 1",
    arrows: [
      { from: "e4", to: "h7", tone: "good" },
      { from: "e1", to: "e8" },
    ],
  },
  tipTitle: "Como montar",
  tip: "O ataque descoberto já está quase pronto quando uma peça sua tampa outra:",
  steps: [
    "Ache uma peça sua parada entre uma torre, bispo ou dama sua e um alvo dele.",
    "Tire essa peça da frente com uma ameaça dela: um xeque, uma captura ou um ataque.",
    "Ele só consegue responder a uma das duas.",
  ],
  lookFor: "um ataque descoberto",
  hint: "Uma peça sua está bloqueando o ataque de outra. Tire ela do caminho com uma ameaça.",
  success: "Ataque descoberto: duas ameaças de uma vez.",
});

export const lessonXequeDuplo = tacticLesson({
  id: "m8-l5",
  title: "Xeque duplo",
  summary: "Duas peças dão xeque juntas: só o rei pode fugir.",
  theme: "doubleCheck",
  concept: "No **xeque duplo**, duas peças dão xeque ao mesmo tempo. Bloquear ou capturar não resolve: o rei é obrigado a andar. Muitas vezes termina em mate.",
  board: {
    fen: "4k3/8/8/8/4N3/8/8/4R1K1 w - - 0 1",
    arrows: [
      { from: "e4", to: "f6", tone: "good" },
      { from: "e1", to: "e8" },
    ],
  },
  tipTitle: "Como montar",
  tip: "É um ataque descoberto em que as duas peças atacam o rei:",
  steps: [
    "Ache uma peça sua entre uma torre, bispo ou dama sua e o rei dele.",
    "Tire essa peça dando xeque também.",
    "Com dois xeques, só o rei pode andar. Veja se ele tem para onde ir.",
  ],
  lookFor: "um xeque duplo",
  hint: "Uma peça sua esconde um xeque. Faça ela sair dando xeque também.",
  success: "Xeque duplo! O rei não tinha defesa.",
});

export const lessonRemocao = tacticLesson({
  id: "m8-l6",
  title: "Remoção do defensor",
  summary: "Capture quem defende e ganhe o que ficou sem defesa.",
  theme: "capturingDefender",
  concept: "Se uma peça só está protegida por outra, capture a **defensora** primeiro. Sem ela, o alvo fica sem proteção.",
  board: {
    fen: "6k1/5ppp/5n2/3b2B1/8/8/8/3R2K1 w - - 0 1",
    arrows: [
      { from: "g5", to: "f6", tone: "good" },
      { from: "d1", to: "d5" },
    ],
    marks: { d5: "focus" },
  },
  tipTitle: "Como montar",
  tip: "Quando uma peça dele parece protegida, pergunte por quem:",
  steps: [
    "Ache a peça dele que você quer ganhar.",
    "Veja quem defende. Se for uma peça só, ela é o alvo.",
    "Capture ou espante o defensor. Depois, pegue a peça que ficou sozinha.",
  ],
  lookFor: "a peça que defende e o que ela protege",
  hint: "Descubra quem protege a peça que você quer ganhar, e ataque esse defensor.",
  success: "Sem o defensor, o alvo caiu.",
});

export const lessonDesvio = tacticLesson({
  id: "m8-l7",
  title: "Desvio",
  summary: "Force um defensor a sair do lugar que ele protege.",
  theme: "deflection",
  concept: "No **desvio**, você oferece ou ataca algo para obrigar uma peça defensora a sair do lugar. O que ela protegia fica exposto.",
  board: "first-puzzle",
  tipTitle: "Como montar",
  tip: "Procure a peça dele que tem trabalho demais:",
  steps: [
    "Ache uma peça dele que defende uma casa ou uma peça importante.",
    "Ofereça algo que ela precise capturar, ou dê um xeque que ela precise bloquear.",
    "Quando ela sair do lugar, aproveite o que ficou sem defesa.",
  ],
  lookFor: "um desvio",
  hint: "Uma peça adversária está segurando tudo. Force-a a sair do lugar.",
  success: "O defensor foi desviado e a posição caiu.",
});
