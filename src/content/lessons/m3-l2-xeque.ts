import { countText } from "@/content/lib/text";
import type { LessonDef, Screen } from "@/content/types";
import { afterMove, boardFor, randomVariant, withRandomKings } from "@/content/lib/positions";
import { legalMoves, load, uciOf } from "@/lib/chess/game";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";
import { pick, shuffle } from "@/lib/random";

/** Positions where a check is possible but not every move checks. */
function giveCheckRounds(n: number): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const piece = pick(["Q", "R", "B", "N"]);
    const sq = pick(ALL_SQUARES);
    const fen = withRandomKings({ [sq]: piece }, "w", (f) => {
      if (load(f).isCheck()) return false;
      const moves = legalMoves(f);
      const checks = moves.filter((m) => afterMove(f, m)?.isCheck());
      return checks.length >= 1 && checks.length <= 4 && checks.every((m) => m.piece !== "k");
    });
    if (!fen) continue;
    const variant = randomVariant(fen, undefined, { flip: true });
    const check = legalMoves(variant).find((m) => afterMove(variant, m)?.isCheck())!;
    out.push({
      kind: "move",
      key: `dar-xeque:${variant}`,
      prompt: "Dê xeque no rei adversário.",
      board: boardFor(variant),
      accept: (_m, after) => after.isCheck(),
      solution: uciOf(check),
      wrong: () => "Esse lance não ataca o rei. Procure uma casa de onde sua peça enxergue o rei.",
      success: "Xeque! Agora o adversário é obrigado a se defender.",
      mistakeNote: "Dar xeque",
    });
  }
  return out;
}

type Method = "fugir" | "bloquear" | "capturar";

const ESCAPE_POOL = [
  "7k/8/8/8/Rb6/8/8/1N2K3 w - - 0 1",
  "6k1/5ppp/8/8/3Q4/4B3/6PP/r5K1 w - - 0 1",
  "k7/8/8/8/8/3n4/2P5/4K3 w - - 0 1",
  "k7/8/5B2/8/7q/8/5R2/7K w - - 0 1",
];

function checkerSquare(fen: string): Square | null {
  const g = load(fen);
  const turn = g.turn();
  const king = ALL_SQUARES.find((s) => {
    const p = g.get(s as Square);
    return p?.type === "k" && p.color === turn;
  }) as Square | undefined;
  if (!king) return null;
  const attackers = g.attackers(king, turn === "w" ? "b" : "w");
  return (attackers[0] as Square) ?? null;
}

function methodOf(m: { piece: string; to: string; captured?: string }, checker: Square): Method {
  if (m.to === checker) return "capturar";
  if (m.piece === "k") return "fugir";
  return "bloquear";
}

const METHOD_PROMPT: Record<Method, string> = {
  fugir: "Você está em xeque. Saia **fugindo com o rei**.",
  bloquear: "Você está em xeque. Saia **colocando uma peça no caminho**.",
  capturar: "Você está em xeque. Saia **capturando a peça que dá o xeque**.",
};

function escapeRounds(n: number): Screen[] {
  const out: Screen[] = [];
  const used = new Set<Method>();
  for (const base of shuffle(ESCAPE_POOL)) {
    if (out.length >= n) break;
    const fen = randomVariant(base);
    const checker = checkerSquare(fen);
    if (!checker) continue;
    const moves = legalMoves(fen);
    const available = shuffle((["fugir", "bloquear", "capturar"] as Method[]).filter((mt) => moves.some((m) => methodOf(m, checker) === mt)));
    const method = available.find((mt) => !used.has(mt)) ?? available[0];
    used.add(method);
    const sol = moves.find((m) => methodOf(m, checker) === method)!;
    out.push({
      kind: "move",
      key: `sair-xeque:${method}:${fen}`,
      prompt: METHOD_PROMPT[method],
      board: boardFor(fen, { marks: { [checker]: "focus" } }),
      accept: (m) => methodOf(m, checker) === method,
      solution: uciOf(sol),
      wrong: (m) => {
        const got = methodOf(m, checker);
        return `\`${m.san}\` também tira do xeque, ${got === "fugir" ? "fugindo" : got === "bloquear" ? "bloqueando" : "capturando"}. Aqui o desafio é ${method === "fugir" ? "fugir com o rei" : method === "bloquear" ? "bloquear o caminho" : "capturar a peça que dá o xeque"}.`;
      },
      success: "Xeque resolvido.",
      mistakeNote: `Sair do xeque ${method === "fugir" ? "fugindo" : method === "bloquear" ? "bloqueando" : "capturando"}`,
    });
  }
  return out;
}

/** Tap every square the king may go to (attacked squares are off limits). */
function kingSquaresRounds(n: number): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const attacker = pick(["r", "b", "q"]);
    const sq = pick(ALL_SQUARES);
    const fen = withRandomKings({ [sq]: attacker }, "w", (f) => {
      const g = load(f);
      if (g.isCheck()) return false;
      const kingMoves = legalMoves(f).filter((m) => m.piece === "k");
      return kingMoves.length >= 2 && kingMoves.length <= 5;
    });
    if (!fen) continue;
    const king = ALL_SQUARES.find((s) => load(fen).get(s as Square)?.type === "k" && load(fen).get(s as Square)?.color === "w") as Square;
    const targets = legalMoves(fen)
      .filter((m) => m.piece === "k")
      .map((m) => m.to as Square);
    out.push({
      kind: "tapAll",
      key: `casas-do-rei:${fen}`,
      prompt: `Toque em todas as casas para onde o rei branco pode ir. ${countText(targets.length)}`,
      board: { fen, marks: { [king]: "focus" } },
      targets,
      wrong: (t) =>
        Math.max(Math.abs(t.charCodeAt(0) - king.charCodeAt(0)), Math.abs(Number(t[1]) - Number(king[1]))) === 1
          ? `O rei não pode ir para \`${t}\`: essa casa está atacada, e o rei nunca entra em xeque.`
          : `\`${t}\` não é vizinha do rei. Ele anda uma casa por vez.`,
      success: "O rei só vai para casas que ninguém ataca.",
      mistakeNote: "Casas seguras para o rei",
    });
  }
  return out;
}

export const lessonXeque: LessonDef = {
  id: "m3-l2",
  title: "Xeque e como sair dele",
  summary: "O que é xeque e os três jeitos de escapar.",
  minutes: 4,
  build: () => [
    {
      kind: "explain",
      title: "Xeque",
      text: "Quando uma peça ataca o rei, é **xeque**. O rei nunca é capturado: quem está em xeque precisa resolver isso no mesmo lance.",
      board: { fen: "4k3/8/8/8/8/8/8/4R1K1 b - - 0 1", arrows: [{ from: "e1", to: "e8" }], marks: { e8: "bad" } },
    },
    ...giveCheckRounds(2),
    {
      kind: "explain",
      title: "Três saídas",
      text: "Para sair do xeque: **fugir** com o rei, **bloquear** colocando uma peça no caminho, ou **capturar** a peça que dá o xeque.",
      board: {
        fen: "4r1k1/8/8/8/8/8/3B4/4K3 w - - 0 1",
        marks: { e8: "focus" },
        arrows: [
          { from: "e1", to: "d1", tone: "good" },
          { from: "d2", to: "e3", tone: "good" },
        ],
      },
      tip: "Contra xeque de cavalo não dá para bloquear: ele pula.",
    },
    ...escapeRounds(3),
    {
      kind: "explain",
      title: "O rei nunca entra em xeque",
      text: "O rei não pode ir para uma casa atacada por peça adversária. Quando você toca no rei, só aparecem as casas seguras.",
      board: { fen: "8/8/8/8/4r3/8/5K2/8 w - - 0 1", marks: { e1: "bad", e2: "bad", e3: "bad" }, arrows: [{ from: "e4", to: "e1" }] },
    },
    ...kingSquaresRounds(1),
  ],
};
