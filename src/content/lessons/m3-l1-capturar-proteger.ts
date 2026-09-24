import type { LessonDef, Screen } from "@/content/types";
import { afterMove, boardFor, randomVariant } from "@/content/lib/positions";
import { toFen, pieceName, type PieceChar } from "@/lib/chess/fen";
import { legalMoves, load, pieceDestinations, uciOf } from "@/lib/chess/game";
import { ALL_SQUARES, fileIndex, rankOf, toSquare, type Square } from "@/lib/chess/squares";
import { pick, pickDistinct } from "@/lib/random";

type Pieces = Partial<Record<Square, PieceChar>>;
const fenOf = (p: Pieces) => toFen(p, "w - - 0 1");
const INNER = ALL_SQUARES.filter((s) => rankOf(s) >= 2 && rankOf(s) <= 7);
const ARTICLE: Record<string, string> = { torre: "a", dama: "a", bispo: "o", cavalo: "o", rei: "o", peão: "o" };

/** Two captures available; only one target is unprotected. */
function safeCaptureRounds(n: number): Screen[] {
  const out: Screen[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 400) {
    const attacker = pick(["R", "B", "Q", "N"] as PieceChar[]);
    const from = pick(ALL_SQUARES);
    const reach = pieceDestinations(attacker, from, () => undefined).filter((s) => INNER.includes(s));
    if (reach.length < 2) continue;
    const [safe, guarded] = pickDistinct(reach, 2);
    const pieces: Pieces = { [from]: attacker, [safe]: pick(["n", "b", "r"] as PieceChar[]), [guarded]: pick(["n", "b", "r"] as PieceChar[]) };
    const side = pick([-1, 1]);
    const defender = toSquare(fileIndex(guarded) + side, rankOf(guarded) + 1);
    if (!defender || pieces[defender] || rankOf(defender) > 7) continue;
    pieces[defender] = "p";
    const fen = fenOf(pieces);
    const captures = legalMoves(fen).filter((m) => m.captured);
    if (captures.length !== 2 || !captures.some((m) => m.to === safe) || !captures.some((m) => m.to === guarded)) continue;
    // After capturing, the "safe" target square must be quiet and the other one covered.
    const takeSafe = afterMove(fen, captures.find((m) => m.to === safe)!);
    const takeGuarded = afterMove(fen, captures.find((m) => m.to === guarded)!);
    if (!takeSafe || !takeGuarded || takeSafe.isAttacked(safe, "b") || !takeGuarded.isAttacked(guarded, "b")) continue;
    const name = pieceName(attacker);
    out.push({
      kind: "move",
      key: `captura-segura:${from}:${safe}:${guarded}`,
      prompt: "Capture a peça preta que está sem proteção.",
      board: { fen },
      accept: (m, after) => Boolean(m.captured) && !after.isAttacked(m.to as Square, "b"),
      solution: uciOf(captures.find((m) => m.to === safe)!),
      wrong: (m) =>
        m.captured
          ? `Essa peça estava protegida: o peão preto em \`${defender}\` captura ${ARTICLE[name]} ${name} de volta.`
          : "Você não capturou nada. Procure uma peça preta que não tenha quem a defenda.",
      success: "Peça sem proteção é presente: dá para capturar sem perder nada.",
      mistakeNote: "Capturar a peça sem proteção",
    });
  }
  return out;
}

interface ProtectItem {
  fen: string;
  target: Square;
}

const PROTECT_POOL: ProtectItem[] = [
  { fen: "3r4/8/8/8/3N4/8/8/R4B2 w - - 0 1", target: "d4" },
  { fen: "8/8/1n6/8/2B5/8/1P6/3Q4 w - - 0 1", target: "c4" },
  { fen: "4b3/8/8/7R/8/6P1/4N3/8 w - - 0 1", target: "h5" },
];

function mirrorSq(sq: Square): Square {
  return toSquare(7 - fileIndex(sq), rankOf(sq))!;
}

function protectRounds(n: number): Screen[] {
  return pickDistinct(PROTECT_POOL, n).map((item) => {
    const mirrored = Math.random() < 0.5;
    const fen = mirrored ? randomVariant(item.fen, (f) => f !== item.fen, { mirror: true }) : item.fen;
    const target = fen === item.fen ? item.target : mirrorSq(item.target);
    const good = legalMoves(fen).find((m) => {
      if (m.from === target) return false;
      const g = load(fen);
      g.move({ from: m.from, to: m.to, promotion: m.promotion });
      return g.isAttacked(target, "w");
    })!;
    return {
      kind: "move",
      key: `proteger:${fen}`,
      prompt: "A peça marcada está sendo atacada. Proteja-a com outra peça.",
      board: { fen, marks: { [target]: "focus" } },
      accept: (m, after) => m.from !== target && after.isAttacked(target, "w"),
      solution: uciOf(good),
      wrong: (m) =>
        m.from === target
          ? "Tirar a peça do ataque também funciona numa partida. Aqui o desafio é protegê-la sem mexer nela."
          : `Depois de \`${m.san}\`, ninguém protege a peça em \`${target}\`. Procure uma peça que possa vigiar essa casa.`,
      success: "Agora, se o adversário capturar, você captura de volta.",
      mistakeNote: "Proteger uma peça atacada",
    } satisfies Screen;
  });
}

export const lessonCapturarProteger: LessonDef = {
  id: "m3-l1",
  title: "Capturar e proteger",
  summary: "Capture peças sem proteção e proteja as suas.",
  minutes: 3,
  build: () => [
    {
      kind: "explain",
      title: "Capturar",
      text: "Para capturar, sua peça vai até a casa de uma peça adversária, que sai do tabuleiro. Cada peça captura do jeito que anda, menos o peão.",
      board: { fen: "8/8/8/3p4/8/8/8/3R4 w - - 0 1", arrows: [{ from: "d1", to: "d5", tone: "good" }], marks: { d5: "focus" } },
    },
    ...safeCaptureRounds(2),
    {
      kind: "explain",
      title: "Proteger",
      text: "Uma peça está **protegida** quando outra peça sua pode capturar de volta quem a capturar. Peça sem proteção é alvo fácil.",
      board: boardFor("4r3/8/8/8/4N3/3P4/8/8 w - - 0 1", {
        arrows: [
          { from: "e8", to: "e4" },
          { from: "d3", to: "e4", tone: "good" },
        ],
        marks: { e4: "focus" },
      }),
      tip: "Antes de cada lance, pergunte: minhas peças estão protegidas?",
    },
    ...protectRounds(2),
  ],
};
