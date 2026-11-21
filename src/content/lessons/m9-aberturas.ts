import type { LessonDef, Screen } from "@/content/types";
import { hangingPieces } from "@/content/lib/analysis";
import { afterMove, boardFor } from "@/content/lib/positions";
import { legalMoves, playLine, uciOf } from "@/lib/chess/game";
import { readMove } from "@shared/notation";
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

/** A choice of the next move in a line, each option checked to be legal. */
function nextMove(key: string, before: string[], prompt: string, options: string[], correct: string, explain: string, note: string): Screen {
  const fen = fenAfter(before);
  const legal = new Set(legalMoves(fen).map((m) => m.san));
  for (const san of options) if (!legal.has(san)) throw new Error(`${san} is not legal after ${before.join(" ")}`);
  return {
    kind: "choice",
    key,
    prompt,
    board: boardFor(fen, { lastMove: lastOf(before) }),
    options: shuffle(options).map((san) => ({ id: san, label: san, mono: true })),
    correct,
    explain,
    mistakeNote: note,
  };
}

/** Play the one move that carries the idea. */
function ideaMove(key: string, before: string[], prompt: string, san: string, wrong: string, success: string, note: string): Screen {
  const fen = fenAfter(before);
  const move = legalMoves(fen).find((m) => m.san === san);
  if (!move) throw new Error(`${san} is not legal after ${before.join(" ")}`);
  return {
    kind: "move",
    key,
    prompt,
    board: boardFor(fen, { lastMove: lastOf(before) }),
    accept: (m) => m.san === san,
    solution: uciOf(move),
    wrong: (m) => `\`${m.san}\` (${readMove(m)}) não é o lance. ${wrong}`,
    success,
    mistakeNote: note,
  };
}

/** Tap the pieces or squares the idea is about. */
function tapIdea(key: string, before: string[], prompt: string, targets: Square[], wrong: string, success: string, note: string): Screen {
  const fen = fenAfter(before);
  return {
    kind: targets.length > 1 ? "tapAll" : "tap",
    key,
    prompt,
    board: boardFor(fen, { lastMove: lastOf(before) }),
    targets,
    wrong: () => wrong,
    success,
    mistakeNote: note,
  } as Screen;
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
      text: "Uma das aberturas mais antigas. As peças saem rápido e o rei roca cedo.",
      steps: [
        "1.`e4` `e5`: cada lado põe um peão no centro.",
        "2.`Nf3` `Nc6`: o cavalo branco ataca `e5`, e o preto defende.",
        "3.`Bc4`: o bispo sai mirando `f7`, o peão que só o rei defende.",
      ],
      board: { fen: START_FEN },
      demo: [{ moves: ["e2e4", "e7e5"] }, { moves: ["g1f3", "b8c6"], arrows: [{ from: "f3", to: "e5" }] }, { moves: ["f1c4"], arrows: [{ from: "c4", to: "f7" }] }],
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
    nextMove(
      "italiana-bc4",
      ["e2e4", "e7e5", "g1f3", "b8c6"],
      "Qual lance monta a Italiana?",
      ["Bc4", "Bb5", "d4", "Nc3"],
      "Bc4",
      "`Bc4` coloca o bispo mirando `f7`: essa é a Italiana. `Bb5` seria a Espanhola, outra abertura.",
      "Lance da Italiana",
    ),
    {
      kind: "explain",
      title: "O plano",
      text: "Depois da abertura, o plano das brancas é simples.",
      steps: ["Faça o roque e leve a torre para `e1`.", "Com `c3` já jogado, avance `d4`: o centro fica seu.", "Se as pretas descuidarem de `f7`, ataque com `Ng5`."],
      board: { fen: fenAfter(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "c2c3", "g8f6", "d2d3", "d7d6"]) },
      demo: [
        { moves: ["e1g1", "e8g8", "f1e1"] },
        { moves: ["a7a6", "d3d4"], area: ["c3", "d4", "e4"] },
        { fen: fenAfter(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"]), moves: ["f3g5"], arrows: [{ from: "g5", to: "f7" }, { from: "c4", to: "f7" }], marks: { f7: "focus" } },
      ],
    },
    nextMove(
      "italiana-c3",
      ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "f8c5"],
      "Qual lance prepara `d4`?",
      ["c3", "a3", "h3", "Qe2"],
      "c3",
      "`c3` apoia `d4`: quando o peão chegar lá, outro peão protege.",
      "Plano da Italiana",
    ),
    ideaMove(
      "italiana-ng5",
      ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"],
      "As pretas tiraram o cavalo e `f7` ficou com um defensor só. Ataque esse peão.",
      "Ng5",
      "O cavalo em `g5` junta forças com o bispo contra `f7`.",
      "Cavalo e bispo contra `f7`. As pretas precisam defender já.",
      "Atacar f7",
    ),
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
      text: "A London é um **sistema**: as brancas montam quase sempre a mesma estrutura, sem importar o que as pretas fazem. Assim, há pouca teoria para decorar.",
      steps: [
        "1.`d4` `d5` 2.`Bf4`: o bispo sai antes de `e3` fechar o caminho dele.",
        "Depois vêm `e3`, `Nf3` e `c3`, quase sem olhar o que as pretas fazem.",
        "A estrutura fica de pé: a pirâmide `c3`, `d4`, `e3`, com o bispo fora dela.",
      ],
      board: { fen: START_FEN },
      demo: [
        { moves: ["d2d4", "d7d5", "c1f4"] },
        { moves: ["g8f6", "e2e3", "e7e6", "g1f3", "c7c5", "c2c3"] },
        { moves: ["b8c6", "b1d2"], area: ["c3", "d4", "e3"], marks: { f4: "good" } },
      ],
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
    tapIdea(
      "london-piramide",
      ["d2d4", "d7d5", "c1f4", "g8f6", "e2e3", "e7e6", "g1f3", "c7c5", "c2c3", "b8c6", "b1d2", "f8d6", "f4g3"],
      "Toque nos três peões da pirâmide que segura o centro.",
      ["c3", "d4", "e3"],
      "Procure os peões brancos do centro que se protegem em escada.",
      "`c3` protege `d4`, e `e3` também. Com a pirâmide, o centro não cai.",
      "A pirâmide da London",
    ),
    {
      kind: "explain",
      title: "O plano",
      text: "A London quase sempre segue o mesmo roteiro.",
      steps: ["Monte a pirâmide `c3`, `d4` e `e3`.", "Complete com `Nbd2`, `Bd3` e o roque.", "Depois, o cavalo pode pular para `e5`."],
      board: { fen: fenAfter(["d2d4", "d7d5", "c1f4", "g8f6", "e2e3", "e7e6", "g1f3", "c7c5", "c2c3", "b8c6"]) },
      demo: [
        { area: ["c3", "d4", "e3"] },
        { moves: ["b1d2", "f8d6", "f1d3", "e8g8", "e1g1"] },
        { moves: ["b7b6", "f3e5"], marks: { e5: "good" } },
      ],
    },
    nextMove(
      "london-c3",
      ["d2d4", "d7d5", "c1f4", "g8f6", "e2e3", "e7e6", "g1f3", "c7c5"],
      "As pretas atacam `d4` com `c5`. Qual lance mantém o centro firme?",
      ["c3", "dxc5", "Nc3", "Bb5+"],
      "c3",
      "`c3` protege `d4` com outro peão, e a pirâmide fica de pé.",
      "Plano da London",
    ),
    nextMove(
      "london-bd3",
      ["d2d4", "d7d5", "c1f4", "g8f6", "e2e3", "e7e6", "g1f3", "c7c5", "c2c3", "b8c6", "b1d2", "f8d6", "f4g3", "e8g8"],
      "Qual é o próximo passo do plano?",
      ["Bd3", "a4", "Rg1", "Ke2"],
      "Bd3",
      "`Bd3` tira a última peça menor de casa e deixa o roque pronto.",
      "Plano da London",
    ),
    {
      kind: "explain",
      title: "O ponto de atenção",
      text: "A London tem um ponto fraco conhecido.",
      steps: ["Com o bispo em `f4`, o peão de `b2` fica sem o bispo para defender.", "Muitas pretas jogam `Qb6` e atacam esse peão."],
      board: { fen: START_FEN },
      demo: [
        { moves: ["d2d4", "d7d5", "c1f4", "c7c5", "e2e3"], marks: { b2: "focus" } },
        { moves: ["d8b6"], arrows: [{ from: "b6", to: "b2" }], marks: { b2: "focus" } },
      ],
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
      text: "Um **gambito** oferece material em troca de centro, tempo ou ataque.",
      steps: [
        "1.`d4` `d5` 2.`c4`: as brancas oferecem o peão de `c4`.",
        "Se as pretas capturarem, o centro fica com as brancas, que jogam `e4`.",
        "Depois, o bispo recupera o peão.",
      ],
      board: { fen: START_FEN },
      demo: [
        { moves: ["d2d4", "d7d5", "c2c4"], arrows: [{ from: "c4", to: "d5" }] },
        { moves: ["d5c4", "e2e4"], area: ["d4", "e4"] },
        { moves: ["e7e6", "f1c4"] },
      ],
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
      title: "O plano",
      text: "As brancas querem que as pretas larguem `d5`.",
      steps: ["Pressione `d5` com `c4` e `Nc3`.", "Crave o cavalo de `f6`, que defende `d5`, com `Bg5`.", "Complete com `e3`, `Nf3`, `Bd3` e o roque."],
      board: { fen: fenAfter(["d2d4", "d7d5", "c2c4", "e7e6"]) },
      demo: [
        { moves: ["b1c3", "g8f6"], arrows: [{ from: "c4", to: "d5" }, { from: "c3", to: "d5" }], marks: { d5: "focus" } },
        { moves: ["c1g5"], arrows: [{ from: "g5", to: "d8" }], marks: { f6: "focus" } },
        { moves: ["f8e7", "e2e3", "e8g8", "g1f3", "b8d7", "f1d3", "c7c6", "e1g1"] },
      ],
    },
    ideaMove(
      "gambito-bg5",
      ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6"],
      "O cavalo de `f6` defende `d5`. Crave-o.",
      "Bg5",
      "O bispo em `g5` prende o cavalo na frente da dama.",
      "Agora o cavalo não pode sair sem entregar a dama, e `d5` fica mais fraco.",
      "Cravar o defensor de d5",
    ),
    tapIdea(
      "gambito-cravado",
      ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5"],
      "Toque na peça preta cravada pelo bispo.",
      ["f6"],
      "Siga a diagonal do bispo de `g5` até a dama preta.",
      "O cavalo de `f6` está entre o bispo e a dama.",
      "Ver a cravada",
    ),
    {
      kind: "explain",
      title: "Se as pretas aceitarem",
      text: "Depois de 2...`dxc4`, não corra atrás do peão com pressa.",
      steps: ["As pretas capturam em `c4`.", "Jogue `e3`: o peão abre o caminho do bispo.", "O bispo recupera o peão e já sai ativo."],
      board: { fen: START_FEN },
      demo: [
        { moves: ["d2d4", "d7d5", "c2c4", "d5c4"], marks: { c4: "focus" } },
        { moves: ["e2e3", "g8f6"], arrows: [{ from: "f1", to: "c4", tone: "good" }] },
        { moves: ["f1c4"] },
      ],
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
    nextMove(
      "gambito-a4",
      ["d2d4", "d7d5", "c2c4", "d5c4", "e2e3", "b7b5"],
      "As pretas seguram o peão de `c4` com `b5`. Qual lance desmancha isso?",
      ["a4", "Bxc4", "Nc3", "Qc2"],
      "a4",
      "`a4` ataca o peão de `b5`, que segura `c4`. Se as pretas jogarem `c6`, vem `axb5 cxb5` e `Qf3`, atacando a torre de `a8`. `Bxc4` perderia o bispo para `bxc4`.",
      "Punir quem segura o peão",
    ),
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
      board: { fen: START_FEN, orientation: "black" },
      steps: ["Responda `e5` e defenda com `Nc6`.", "Desenvolva o bispo e o cavalo de `g8`, e faça o roque.", "Quando der, jogue `d5`: é o lance que solta as pretas."],
      demo: [
        { moves: ["e2e4", "e7e5", "g1f3", "b8c6"] },
        { moves: ["f1c4", "f8c5", "d2d3", "g8f6", "b1c3", "e8g8"] },
        { moves: ["h2h3", "d7d5"], arrows: [{ from: "d5", to: "e4" }] },
      ],
    },
    nextMove(
      "pretas-nc6",
      ["e2e4", "e7e5", "g1f3"],
      "O cavalo branco ataca `e5`. Qual defesa também tira uma peça de casa?",
      ["Nc6", "f6", "Qe7", "d6"],
      "Nc6",
      "`Nc6` defende e desenvolve. `f6` enfraquece o rei, `Qe7` traz a dama cedo, e `d6` defende mas prende o bispo de `f8`.",
      "Defender e5 desenvolvendo",
    ),
    lineScreen({
      key: "pretas-italiana",
      prompt: "As brancas vão de Italiana. Responda com as pretas.",
      before: ["e2e4"],
      line: ["e7e5", "g1f3", "b8c6", "f1c4", "f8c5", "e1g1", "g8f6", "d2d3", "d7d6"],
      comments: ["Disputa o centro.", "Defende `e5` desenvolvendo.", "Bispo ativo, mirando `f2`.", "Desenvolve e ataca `e4`.", "Protege `e5` e abre o bispo de `c8`. Depois vem o roque."],
      success: "Posição equilibrada e fácil de jogar.",
      note: "Pretas contra a Italiana",
    }),
    nextMove(
      "pretas-bc5",
      ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
      "O bispo branco mira `f7`. Qual lance desenvolve e mira `f2` de volta?",
      ["Bc5", "h6", "a6", "Qf6"],
      "Bc5",
      "`Bc5` faz com as brancas o que elas fazem com você: mira o peão que só o rei defende.",
      "Pretas contra a Italiana",
    ),
    {
      kind: "explain",
      title: "Contra o ataque em f7",
      text: "O ataque mais rápido contra as pretas mira `f7`.",
      steps: ["As brancas jogam `Ng5`: cavalo e bispo contra `f7`.", "Responda `d5`: o peão fecha a diagonal do bispo e contra-ataca no centro."],
      board: { fen: fenAfter(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6"]), orientation: "black" },
      demo: [
        { moves: ["f3g5"], arrows: [{ from: "g5", to: "f7" }, { from: "c4", to: "f7" }], marks: { f7: "focus" } },
        { moves: ["d7d5"], arrows: [{ from: "d5", to: "c4", tone: "good" }] },
      ],
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
    quiz("pretas-e4-quiz", "Qual lance costuma soltar o jogo das pretas nessas aberturas?", "d5, que briga pelo centro", ["h6, que prende o cavalo", "a6, que ameaça o bispo"], "Plano das pretas"),
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
      board: { fen: START_FEN, orientation: "black" },
      steps: ["Segure `d5` com `e6` e `Nf6`.", "Coloque o bispo em `e7` e faça o roque.", "Depois, prepare `c5` para ganhar espaço."],
      demo: [
        { moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6"], marks: { d5: "good" } },
        { moves: ["c1g5", "f8e7", "e2e3", "e8g8"] },
        { moves: ["g1f3", "c7c5"], arrows: [{ from: "c5", to: "d4" }] },
      ],
    },
    nextMove(
      "pretas-e6",
      ["d2d4", "d7d5", "c2c4"],
      "Qual lance segura `d5` com um peão?",
      ["e6", "Nf6", "a6", "h6"],
      "e6",
      "`e6` protege `d5` com um peão e abre o bispo de `f8`. (`c6` também serve: é outra defesa, a Eslava.)",
      "Segurar d5",
    ),
    tapIdea(
      "pretas-atras",
      ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5"],
      "O bispo branco crava o seu cavalo. Toque na peça que está atrás dele.",
      ["d8"],
      "Siga a diagonal de `g5`, passando pelo cavalo.",
      "A dama. Se o cavalo sair, a dama cai.",
      "Ver a cravada",
    ),
    ideaMove(
      "pretas-be7",
      ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5"],
      "Desfaça a cravada tirando uma peça de casa.",
      "Be7",
      "Coloque o bispo em `e7`, entre o cavalo e a dama.",
      "Com o bispo no meio, o cavalo está livre de novo e o roque ficou pronto.",
      "Desfazer a cravada",
    ),
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
      steps: ["As brancas cravam o cavalo de `f6` e trocam os peões no centro.", "`Nxd5` parece ganhar um peão, porque o cavalo de `f6` parece preso pela cravada."],
      board: { fen: START_FEN, orientation: "black" },
      demo: [
        { moves: ["d2d4", "d7d5", "c2c4", "e7e6", "b1c3", "g8f6", "c1g5", "b8d7", "c4d5", "e6d5"], arrows: [{ from: "g5", to: "d8" }] },
        { moves: ["c3d5"], marks: { d5: "focus" } },
      ],
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
