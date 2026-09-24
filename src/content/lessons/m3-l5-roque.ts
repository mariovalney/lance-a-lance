import type { LessonDef, Screen } from "@/content/types";
import { boardFor, flipColors } from "@/content/lib/positions";
import { legalMoves, load, uciOf } from "@/lib/chess/game";
import type { Square } from "@/lib/chess/squares";
import { shuffle } from "@/lib/random";

const CASTLE_POOL: { fen: string; sides: ("k" | "q")[] }[] = [
  { fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", sides: ["k"] },
  { fen: "r3kbnr/ppp1pppp/2nq4/3p1b2/3P1B2/2NQ4/PPP1PPPP/R3KBNR w KQkq - 6 5", sides: ["q"] },
  { fen: "r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 6 8", sides: ["k", "q"] },
];

function castleRounds(): Screen[] {
  const picks = shuffle(CASTLE_POOL).slice(0, 2);
  return picks.map((item, i) => {
    const side = item.sides.length > 1 ? (i === 0 ? "q" : "k") : item.sides[0];
    const fen = Math.random() < 0.4 ? flipColors(item.fen) : item.fen;
    const castle = legalMoves(fen).find((m) => m.flags.includes(side))!;
    const name = side === "k" ? "pequeno" : "grande";
    const rookFile = side === "k" ? "h" : "a";
    return {
      kind: "move",
      key: `roque:${side}:${fen}`,
      prompt: `Faça o **roque ${name}** (\`${side === "k" ? "O-O" : "O-O-O"}\`).`,
      board: boardFor(fen),
      accept: (m) => m.flags.includes(side),
      solution: uciOf(castle),
      wrong: (m) =>
        m.flags.includes(side === "k" ? "q" : "k")
          ? `Esse foi o roque ${side === "k" ? "grande" : "pequeno"}. O ${name} é para o lado da torre de \`${rookFile}\`.`
          : `Para rocar, toque no rei e depois na casa a duas casas dele, em direção à torre de \`${rookFile}\`.`,
      illegal: "Para rocar, mova o rei duas casas em direção à torre. A torre pula sozinha.",
      success: "O rei ficou protegido no canto e a torre saiu para o jogo. Rocar cedo é um ótimo hábito.",
      mistakeNote: `Roque ${name}`,
    } satisfies Screen;
  });
}

interface CanItem {
  fen: string;
  note?: string;
}

const CAN_POOL: CanItem[] = [
  { fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3" },
  { fen: "rn1qkbnr/ppp2ppp/8/3pp3/8/5NPb/PPPPPP1P/RNBQK2R w KQkq - 0 4" },
  { fen: "rnbqk1nr/pppp1ppp/8/4p3/1b1P4/5N2/PPP1BPPP/RNBQK2R w KQkq - 2 4" },
  { fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4" },
  { fen: "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w Qkq - 6 5", note: "Neste jogo, a torre de `h1` já andou e voltou." },
  { fen: "rnbqk1nr/pppp1ppp/8/2b1p3/2B1PP2/5N2/PPPP2PP/RNBQK2R w KQkq - 1 4" },
];

function reasonFor(fen: string, note?: string): { can: boolean; why: string } {
  const g = load(fen);
  const white = g.turn() === "w";
  const r = white ? "1" : "8";
  const can = legalMoves(fen).some((m) => m.flags.includes("k"));
  if (can) return { can, why: "Pode: rei e torre ainda não se mexeram, o caminho está livre e o rei não passa por casa atacada." };
  if (note) return { can, why: "Não pode: depois que o rei ou a torre se mexem, aquele roque não vale mais na partida." };
  if (g.isCheck()) return { can, why: "Não pode: o rei está em xeque. Não se roca para fugir do xeque." };
  const f = `f${r}` as Square;
  const gg = `g${r}` as Square;
  if (g.get(f) || g.get(gg)) return { can, why: "Não pode: tem peça entre o rei e a torre." };
  const them = white ? "b" : "w";
  if (g.isAttacked(f, them)) return { can, why: `Não pode: o rei passaria por \`${f}\`, que está atacada.` };
  return { can, why: `Não pode: o rei pararia em \`${gg}\`, que está atacada.` };
}

function canCastleRounds(n: number): Screen[] {
  const pool = shuffle(CAN_POOL);
  // Make sure at least one "yes" and one "no".
  const yes = pool.find((p) => reasonFor(p.fen, p.note).can)!;
  const nos = pool.filter((p) => !reasonFor(p.fen, p.note).can);
  const chosen = shuffle([yes, ...shuffle(nos).slice(0, n - 1)]);
  return chosen.map((item) => {
    const flip = !item.note && Math.random() < 0.3;
    const fen = flip ? flipColors(item.fen) : item.fen;
    const { can, why } = reasonFor(fen, item.note);
    const side = fen.split(" ")[1] === "w" ? "brancas" : "pretas";
    return {
      kind: "choice",
      key: `pode-rocar:${fen}`,
      prompt: `As ${side} podem fazer o roque pequeno agora?${item.note ? ` ${item.note}` : ""}`,
      board: boardFor(fen),
      options: [
        { id: "sim", label: "Pode" },
        { id: "nao", label: "Não pode" },
      ],
      correct: can ? "sim" : "nao",
      explain: why,
      mistakeNote: "Quando o roque é permitido",
    } satisfies Screen;
  });
}

export const lessonRoque: LessonDef = {
  id: "m3-l5",
  title: "Roque",
  summary: "O lance especial que protege o rei e ativa a torre.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "O roque",
      text: "No **roque**, o rei anda duas casas em direção a uma torre, e a torre pula para o outro lado dele. É um lance só, que esconde o rei e ativa a torre.",
      board: {
        fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
        arrows: [
          { from: "e1", to: "g1" },
          { from: "h1", to: "f1", tone: "hint" },
          { from: "e1", to: "c1" },
          { from: "a1", to: "d1", tone: "hint" },
        ],
      },
      tip: "Roque pequeno, para o lado de `h`: `O-O`. Roque grande, para o lado de `a`: `O-O-O`.",
    },
    ...castleRounds(),
    {
      kind: "explain",
      title: "Quando não pode",
      text: "Não dá para rocar se o rei ou aquela torre já se mexeram, se o rei está em xeque, se há peças entre eles, ou se o rei passaria ou pararia em casa atacada.",
      board: {
        fen: "rn1qkbnr/ppp2ppp/8/3pp3/8/5NPb/PPPPPP1P/RNBQK2R w KQkq - 0 4",
        marks: { f1: "bad", h3: "focus" },
        arrows: [{ from: "h3", to: "f1" }],
      },
    },
    ...canCastleRounds(3),
  ],
};
