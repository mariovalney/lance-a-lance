import type { LessonDef, Screen } from "@/content/types";
import { hangingPieces } from "@/content/lib/analysis";
import { afterMove, boardFor } from "@/content/lib/positions";
import { legalMoves, playLine, uciOf } from "@/lib/chess/game";
import { START_FEN, type Square } from "@/lib/chess/squares";
import { shuffle } from "@/lib/random";

/** FEN after playing UCI moves from the start. */
function fenAfter(moves: string[]): string {
  if (!moves.length) return START_FEN;
  const res = playLine(START_FEN, moves);
  if (!res) throw new Error(`bad line ${moves.join(" ")}`);
  return res.fens[res.fens.length - 1];
}

function lastOf(moves: string[]): [Square, Square] | undefined {
  const m = moves[moves.length - 1];
  return m ? [m.slice(0, 2) as Square, m.slice(2, 4) as Square] : undefined;
}

interface LineSpec {
  key: string;
  prompt: string;
  before: string[];
  line: string[];
  comments: string[];
  success: string;
  note: string;
  mate?: boolean;
}

function lineScreen(s: LineSpec): Screen {
  const fen = fenAfter(s.before);
  return {
    kind: "sequence",
    key: s.key,
    prompt: s.prompt,
    board: boardFor(fen, { lastMove: lastOf(s.before) }),
    line: s.line,
    anyMateAtEnd: s.mate,
    comments: s.comments,
    wrong: (m, i) => {
      const exp = legalMovesAfter(s, i);
      return `\`${m.san}\` não é o lance da linha. ${exp ? `O próximo é \`${exp}\`: ${s.comments[i] ?? ""}` : ""}`.trim();
    },
    success: s.success,
    mistakeNote: s.note,
  };
}

function legalMovesAfter(s: LineSpec, plyIndex: number): string | null {
  const pre = [...s.before, ...s.line.slice(0, plyIndex * 2)];
  const fen = fenAfter(pre);
  const uci = s.line[plyIndex * 2];
  const m = legalMoves(fen).find((x) => uciOf(x) === uci);
  return m ? m.san : null;
}

function quiz(key: string, q: string, a: string, others: string[], note: string): Screen {
  return {
    kind: "choice",
    key,
    prompt: q,
    options: shuffle([a, ...others]).map((t) => ({ id: t, label: t })),
    correct: a,
    explain: `${a}.`,
    mistakeNote: note,
  };
}

/** "Defend your pawn/piece" in an opening position. */
function keepEverythingSafe(key: string, before: string[], prompt: string, target: Square, note: string): Screen {
  const fen = fenAfter(before);
  const color = fen.split(" ")[1] as "w" | "b";
  const ok = (m: Parameters<typeof afterMove>[1]) => hangingPieces(afterMove(fen, m)!.fen(), color).length === 0;
  const sol = legalMoves(fen).find((m) => ok(m))!;
  return {
    kind: "move",
    key,
    prompt,
    board: boardFor(fen, { lastMove: lastOf(before), marks: { [target]: "focus" } }),
    accept: (m) => ok(m),
    solution: uciOf(sol),
    wrong: (m) => `Depois de \`${m.san}\`, o peão de \`${target}\` (ou outra peça) fica sem proteção.`,
    success: "Tudo protegido. Na abertura, um peão a menos já pesa.",
    mistakeNote: note,
  };
}

/* ---------- Italiana ---------- */

export const lessonItaliana: LessonDef = {
  id: "m9-l1",
  title: "Italiana",
  summary: "`e4`, `Nf3` e o bispo em `c4` mirando `f7`.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "Abertura Italiana",
      text: "Uma das aberturas mais antigas: 1.`e4` `e5` 2.`Nf3` `Nc6` 3.`Bc4`. O bispo mira `f7`, as peças saem rápido e o rei roca cedo.",
      board: { fen: fenAfter(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"]), arrows: [{ from: "c4", to: "f7" }] },
    },
    lineScreen({
      key: "italiana-linha",
      prompt: "Jogue a linha principal da Italiana com as brancas.",
      before: [],
      line: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "c2c3", "g8f6", "d2d3", "d7d6", "e1g1"],
      comments: [
        "Ocupa o centro e abre o bispo e a dama.",
        "Desenvolve atacando o peão de `e5`.",
        "O bispo italiano mira `f7`, o ponto fraco.",
        "Prepara `d4` para ganhar o centro depois.",
        "Versão calma: protege `e4` e abre o outro bispo.",
        "Rei seguro. Agora vêm `Re1`, `Nbd2` e o avanço `d4`.",
      ],
      success: "Essa é a base da Italiana. Refaça algumas vezes para decorar.",
      note: "Linha da Italiana",
    }),
    {
      kind: "explain",
      title: "O plano",
      text: "Com a Italiana armada, as brancas seguem um roteiro simples:",
      steps: ["Rocar e colocar a torre em `e1`.", "Preparar `d4` com `c3` para dominar o centro.", "Se as pretas descuidarem de `f7`, atacar com `Ng5` ou sacrifícios."],
    },
    lineScreen({
      key: "italiana-legal",
      prompt: "Mate de Legal: as pretas prenderam seu cavalo, mas foram descuidadas. Comece capturando em `e5` com o cavalo, mesmo largando a dama.",
      before: ["e2e4", "e7e5", "g1f3", "d7d6", "f1c4", "c8g4", "b1c3", "g7g6"],
      line: ["f3e5", "g4d1", "c4f7", "e8e7", "c3d5"],
      comments: ["O cavalo sai da cravada e ataca `f7`.", "Xeque! O rei é obrigado a subir.", "Mate! Cavalos e bispo fecham todas as casas."],
      mate: true,
      success: "Esse é o famoso mate de Legal: a dama foi isca.",
      note: "Mate de Legal",
    }),
    quiz("italiana-quiz", "Qual é o alvo do bispo branco em `c4` na Italiana?", "O peão de f7, que só o rei defende", ["O peão de a7", "A torre de h8"], "Ideia da Italiana"),
  ],
};

/* ---------- London ---------- */

export const lessonLondon: LessonDef = {
  id: "m9-l2",
  title: "London",
  summary: "Um sistema: `d4`, `Bf4`, `e3`, `Nf3`, `c3` e quase sempre o mesmo plano.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "Sistema London",
      text: "A London é um **sistema**: as brancas montam quase sempre a mesma estrutura, sem importar o que as pretas fazem. Ótima para economizar teoria.",
      board: { fen: fenAfter(["d2d4", "d7d5", "c1f4", "g8f6", "e2e3", "e7e6", "g1f3", "c7c5", "c2c3", "b8c6", "b1d2", "f8d6", "f4g3"]), marks: { c3: "soft", d4: "soft", e3: "soft", g3: "good" } },
    },
    lineScreen({
      key: "london-linha",
      prompt: "Monte a London com as brancas depois de 1.`d4` `d5`.",
      before: ["d2d4", "d7d5"],
      line: ["c1f4", "g8f6", "e2e3", "e7e6", "g1f3", "c7c5", "c2c3", "b8c6", "b1d2", "f8d6", "f4g3"],
      comments: [
        "O bispo sai antes de `e3` prender ele atrás dos peões.",
        "Firma o centro e abre o outro bispo.",
        "Desenvolve e protege `d4`.",
        "A pirâmide `c3`-`d4`-`e3` segura o centro.",
        "O cavalo apoia `e4` e `c4`.",
        "Mantém o bispo. Se as pretas trocarem em `g3`, a coluna `h` abre para a sua torre.",
      ],
      success: "Essa estrutura serve contra quase tudo. Depois vêm `Bd3`, `O-O` e às vezes `Ne5`.",
      note: "Linha da London",
    }),
    {
      kind: "explain",
      title: "O ponto de atenção",
      text: "Com o bispo em `f4`, o peão de `b2` fica sem o bispo para defender. Muitas pretas jogam `Qb6` para atacá-lo.",
      board: { fen: fenAfter(["d2d4", "d7d5", "c1f4", "c7c5", "e2e3", "d8b6"]), arrows: [{ from: "b6", to: "b2" }], marks: { b2: "focus" } },
    },
    keepEverythingSafe(
      "london-b2",
      ["d2d4", "d7d5", "c1f4", "c7c5", "e2e3", "d8b6"],
      "A dama preta ataca `b2`. Faça um lance que deixe tudo protegido.",
      "b2",
      "Defender b2 na London",
    ),
    quiz("london-quiz", "Por que o bispo vai para `f4` antes de jogar `e3`?", "Depois de e3 ele ficaria preso atrás do peão", ["Porque o bispo não pode passar de c1", "Para atacar o rei preto"], "Ideia da London"),
  ],
};

/* ---------- Gambito da Dama ---------- */

export const lessonGambitoDama: LessonDef = {
  id: "m9-l3",
  title: "Gambito da Dama",
  summary: "1.`d4` `d5` 2.`c4`: oferecer um peão para dominar o centro.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "Gambito da Dama",
      text: "Um **gambito** oferece material em troca de centro, tempo ou ataque. Em 2.`c4`, se as pretas capturarem, as brancas ficam com o centro e recuperam o peão depois.",
      board: { fen: fenAfter(["d2d4", "d7d5", "c2c4"]), arrows: [{ from: "c4", to: "d5" }] },
    },
    lineScreen({
      key: "gambito-recusado",
      prompt: "Jogue o Gambito da Dama Recusado com as brancas.",
      before: [],
      line: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "f8e7", "e2e3", "e8g8", "g1f3"],
      comments: [
        "Ocupa o centro.",
        "O gambito: pressiona o peão de `d5`.",
        "Mais pressão em `d5`.",
        "Crava o cavalo que defende `d5`.",
        "Abre o bispo de casas claras.",
        "Desenvolvimento completo do lado do rei. Depois: `Rc1` e `Bd3`.",
      ],
      success: "Posição clássica: centro forte e peças ativas.",
      note: "Linha do Gambito Recusado",
    }),
    {
      kind: "explain",
      title: "Se as pretas aceitarem",
      text: "Depois de 2...`dxc4`, não corra atrás do peão com pressa. Jogue `e3` e recupere com o bispo: ele sai já ativo.",
      board: { fen: fenAfter(["d2d4", "d7d5", "c2c4", "d5c4"]), arrows: [{ from: "f1", to: "c4", tone: "good" }], marks: { c4: "focus" } },
    },
    lineScreen({
      key: "gambito-aceito",
      prompt: "As pretas aceitaram o gambito. Recupere o peão do jeito tranquilo.",
      before: ["d2d4", "d7d5", "c2c4", "d5c4"],
      line: ["e2e3", "g8f6", "f1c4"],
      comments: ["Abre caminho para o bispo.", "Peão recuperado e bispo desenvolvido."],
      success: "Material igual e centro das brancas.",
      note: "Gambito da Dama Aceito",
    }),
    quiz("gambito-quiz", "O que é um gambito?", "Oferecer material em troca de centro, tempo ou ataque", ["Uma armadilha que ganha a dama", "Um jeito de fazer o roque mais cedo"], "O que é gambito"),
  ],
};

/* ---------- Pretas contra 1.e4 ---------- */

export const lessonPretasE4: LessonDef = {
  id: "m9-l4",
  title: "Com pretas contra 1.e4",
  summary: "Responda `e5` e desenvolva: cavalo, bispo e roque.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "1...e5",
      text: "Contra 1.`e4`, responder 1...`e5` segue os mesmos princípios: centro, desenvolvimento e roque. Você aprende a jogar dos dois lados.",
      board: { fen: fenAfter(["e2e4", "e7e5"]), orientation: "black" },
    },
    lineScreen({
      key: "pretas-italiana",
      prompt: "As brancas vão de Italiana. Responda com as pretas.",
      before: ["e2e4"],
      line: ["e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1", "g8f6", "d2d3", "d7d6"],
      comments: ["Disputa o centro.", "Defende `e5` desenvolvendo.", "Bispo ativo, mirando `f2`.", "Desenvolve e ataca `e4`.", "Protege `e5` e abre o bispo de `c8`. Depois vem o roque."],
      success: "Posição equilibrada e fácil de jogar.",
      note: "Pretas contra a Italiana",
    }),
    {
      kind: "explain",
      title: "Contra o ataque em f7",
      text: "Se as brancas jogarem `Ng5` mirando `f7`, a resposta é `d5`: fecha a diagonal do bispo e contra-ataca no centro.",
      board: { fen: fenAfter(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "f3g5"]), orientation: "black", marks: { f7: "focus" }, arrows: [{ from: "g5", to: "f7" }] },
    },
    {
      kind: "move",
      key: "pretas-d5",
      prompt: "As brancas atacam `f7` com cavalo e bispo. Defenda do jeito clássico.",
      board: boardFor(fenAfter(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "f3g5"]), { lastMove: ["f3", "g5"] }),
      accept: (m) => m.san === "d5",
      solution: "d7d5",
      wrong: (m) => `\`${m.san}\` deixa \`f7\` sob pressão. Jogue \`d5\`: fecha o bispo de \`c4\` e disputa o centro.`,
      success: "`d5`! O bispo branco é bloqueado e as pretas ganham espaço.",
      mistakeNote: "Defesa contra Ng5",
    },
    lineScreen({
      key: "pretas-espanhola",
      prompt: "E se vier a Espanhola (`Bb5`)? Responda com as pretas.",
      before: ["e2e4", "e7e5", "g1f3", "b8c6", "f1b5"],
      line: ["a7a6", "b5a4", "g8f6", "e1g1", "f8e7"],
      comments: ["Pergunta ao bispo: troca ou recua?", "Desenvolve e ataca `e4`.", "Prepara o roque. Posição sólida."],
      success: "Você tem respostas para as duas aberturas mais comuns com `e4` `e5`.",
      note: "Pretas contra a Espanhola",
    }),
  ],
};

/* ---------- Pretas contra 1.d4 ---------- */

export const lessonPretasD4: LessonDef = {
  id: "m9-l5",
  title: "Com pretas contra 1.d4",
  summary: "Gambito da Dama Recusado: `d5`, `e6`, `Nf6`, `Be7` e roque.",
  minutes: 5,
  build: () => [
    {
      kind: "explain",
      title: "Recusando o gambito",
      text: "Contra 1.`d4` `d5` 2.`c4`, o lance `e6` defende `d5` com um peão e mantém o centro. É uma das defesas mais sólidas do xadrez.",
      board: { fen: fenAfter(["d2d4", "d7d5", "c2c4", "e7e6"]), orientation: "black", marks: { d5: "good" } },
    },
    lineScreen({
      key: "pretas-grd",
      prompt: "Jogue o Gambito da Dama Recusado com as pretas.",
      before: ["d2d4"],
      line: ["d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "f8e7", "e2e3", "e8g8"],
      comments: ["Ocupa o centro.", "Segura `d5` com peão.", "Desenvolve e defende `d5` de novo.", "Desfaz a cravada do cavalo.", "Rei seguro. Depois: `Nbd7`, `c6` ou `b6`."],
      success: "Estrutura sólida, fácil de jogar.",
      note: "Linha do Recusado com pretas",
    }),
    {
      kind: "explain",
      title: "A armadilha do elefante",
      text: "Se as brancas capturarem o peão de `d5` com o cavalo cedo demais, uma sequência de xeques ganha uma peça para as pretas.",
      board: {
        fen: fenAfter(["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "b8d7", "c4d5", "e6d5", "c3d5"]),
        orientation: "black",
        lastMove: ["c3", "d5"],
        marks: { d5: "focus" },
      },
    },
    lineScreen({
      key: "pretas-elefante",
      prompt: "O cavalo branco capturou em `d5`, contando que o seu cavalo está cravado. Mostre que não está.",
      before: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "b8d7", "c4d5", "e6d5", "c3d5"],
      line: ["f6d5", "g5d8", "f8b4", "d1d2", "b4d2", "e1d2", "e8d8"],
      comments: [
        "Entrega a dama de propósito.",
        "Xeque! A dama branca precisa bloquear.",
        "Troca com xeque.",
        "Você deu a dama, mas ganhou dama, bispo e cavalo: saldo de uma peça a mais.",
      ],
      success: "Essa é a armadilha do elefante, uma das mais antigas do Gambito da Dama.",
      note: "Armadilha do elefante",
    }),
    quiz("pretas-d4-quiz", "Por que `e6` é um bom lance contra o Gambito da Dama?", "Defende d5 com um peão e abre o bispo de f8", ["Ataca a dama branca", "Prepara o roque grande"], "Ideia do Recusado"),
  ],
};
