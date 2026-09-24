import type { BoardSpec, LessonDef, Screen } from "@/content/types";
import { puzzleBoard, puzzleRounds, puzzlesOf, type PuzzleTheme } from "@/content/lib/puzzles";

interface TacticSpec {
  id: string;
  title: string;
  summary: string;
  theme: PuzzleTheme;
  concept: string;
  board: BoardSpec | "first-puzzle";
  tipTitle: string;
  tip: string;
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

function tacticLesson(spec: TacticSpec): LessonDef {
  return {
    id: spec.id,
    title: spec.title,
    summary: spec.summary,
    minutes: 4,
    build: () => {
      const { board, skip } = exampleBoard(spec);
      const opts = { lookFor: spec.lookFor, hint: spec.hint, success: spec.success, note: spec.title, skip };
      const rounds = puzzleRounds(spec.theme, 5, opts);
      const screens: Screen[] = [
        { kind: "explain", title: spec.title, text: spec.concept, board },
        ...rounds.slice(0, 3),
        { kind: "explain", title: spec.tipTitle, text: spec.tip },
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
  tipTitle: "Onde procurar",
  tip: "Procure duas peças adversárias soltas (ou rei e dama) que uma mesma peça sua consiga atacar juntas. Xeque com ataque a outra peça é o garfo mais forte.",
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
  tipTitle: "Aproveite a cravada",
  tip: "Peça cravada é peça que não defende direito. Ataque-a de novo com outra peça, de preferência um peão.",
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
  tipTitle: "Onde procurar",
  tip: "Rei e dama (ou dama e torre) na mesma coluna, fileira ou diagonal são alvos de espeto para torres, bispos e damas.",
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
  tipTitle: "Onde procurar",
  tip: "Procure uma peça sua que está entre uma torre, bispo ou dama sua e um alvo adversário. Mexa essa peça ameaçando outra coisa.",
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
  tipTitle: "Onde procurar",
  tip: "É um ataque descoberto em que a peça que sai também dá xeque. Procure uma peça sua entre a sua torre, bispo ou dama e o rei adversário.",
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
  tipTitle: "Onde procurar",
  tip: "Quando uma peça adversária parece protegida, pergunte: por quem? Dá para capturar ou afastar esse defensor?",
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
  tipTitle: "Onde procurar",
  tip: "Descubra qual peça adversária tem trabalho demais. Se ela sair do lugar, o que acontece? Force essa saída com xeque ou captura.",
  lookFor: "um desvio",
  hint: "Uma peça adversária está segurando tudo. Force-a a sair do lugar.",
  success: "O defensor foi desviado e a posição caiu.",
});
