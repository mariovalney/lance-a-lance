import type { Chess, Move } from "chess.js";
import { readMove } from "@/lib/chess/notation";
import { FILES, fileIndex, rankOf, toSquare, type Square } from "@/lib/chess/squares";

/*
 * The "box" of the basic mates: the part of the board the lone king can still
 * walk to. The side to move is the attacker; the other side has only its king.
 * Positions are read straight from the FEN and attacks are cast by hand,
 * because a lesson judges every legal move of several positions as it builds.
 */

type Color = "w" | "b";
type Board = Map<Square, string>;

const other = (c: Color): Color => (c === "w" ? "b" : "w");
const colorOf = (piece: string): Color => (piece === piece.toUpperCase() ? "w" : "b");

export const kingDistance = (a: Square, b: Square) =>
  Math.max(Math.abs(fileIndex(a) - fileIndex(b)), Math.abs(rankOf(a) - rankOf(b)));

function parse(fen: string): { board: Board; turn: Color } {
  const board: Board = new Map();
  const [placement, turn] = fen.split(" ");
  placement.split("/").forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += Number(ch);
      else board.set(`${FILES[f++]}${8 - i}` as Square, ch);
    }
  });
  return { board, turn: turn as Color };
}

const kingOf = (board: Board, color: Color) => [...board].find(([, p]) => p === (color === "w" ? "K" : "k"))![0];

const step = (sq: Square, df: number, dr: number) => toSquare(fileIndex(sq) + df, rankOf(sq) + dr);

const KING_STEPS = [-1, 0, 1].flatMap((df) => [-1, 0, 1].map((dr) => [df, dr])).filter(([df, dr]) => df || dr);
const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const ROOK_RAYS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_RAYS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

const neighbours = (sq: Square) => KING_STEPS.flatMap(([df, dr]) => step(sq, df, dr) ?? []);

/** Every square a side attacks, occupied ones included (a defended piece is attacked by its own side). */
function attacks(board: Board, color: Color): Set<Square> {
  const out = new Set<Square>();
  const rays = (from: Square, dirs: number[][]) => {
    for (const [df, dr] of dirs) {
      for (let sq = step(from, df, dr); sq; sq = step(sq, df, dr)) {
        out.add(sq);
        if (board.has(sq)) break;
      }
    }
  };
  for (const [sq, piece] of board) {
    if (colorOf(piece) !== color) continue;
    const kind = piece.toLowerCase();
    if (kind === "k") neighbours(sq).forEach((n) => out.add(n));
    if (kind === "n") KNIGHT_STEPS.forEach(([df, dr]) => step(sq, df, dr) && out.add(step(sq, df, dr)!));
    if (kind === "r" || kind === "q") rays(sq, ROOK_RAYS);
    if (kind === "b" || kind === "q") rays(sq, BISHOP_RAYS);
    if (kind === "p") [-1, 1].forEach((df) => step(sq, df, color === "w" ? 1 : -1) && out.add(step(sq, df, color === "w" ? 1 : -1)!));
  }
  return out;
}

type Step = Pick<Move, "from" | "to" | "piece">;

/**
 * The attacker's legal moves. Against a lone king nothing can be pinned and the
 * attacker is never in check, so every move of a piece is legal, and a king
 * move is legal unless it lands next to the other king or on its own piece.
 */
function movesOf(board: Board, color: Color): Step[] {
  const out: Step[] = [];
  const lone = kingOf(board, other(color));
  const own = (sq: Square) => board.has(sq) && colorOf(board.get(sq)!) === color;
  for (const [from, piece] of board) {
    if (colorOf(piece) !== color) continue;
    const kind = piece.toLowerCase() as Step["piece"];
    const add = (to: Square | null) => to && !own(to) && to !== lone && out.push({ from, to, piece: kind });
    if (kind === "k") neighbours(from).forEach((to) => kingDistance(to, lone) > 1 && add(to));
    if (kind === "n") KNIGHT_STEPS.forEach(([df, dr]) => add(step(from, df, dr)));
    const slide = (dirs: number[][]) =>
      dirs.forEach(([df, dr]) => {
        for (let to = step(from, df, dr); to && !board.has(to); to = step(to, df, dr)) add(to);
      });
    if (kind === "r" || kind === "q") slide(ROOK_RAYS);
    if (kind === "b" || kind === "q") slide(BISHOP_RAYS);
    if (kind === "p") throw new Error("the box is for endings without pawns");
  }
  return out;
}

const played = (board: Board, m: Pick<Move, "from" | "to">): Board => {
  const next = new Map(board);
  next.set(m.to as Square, next.get(m.from as Square)!);
  next.delete(m.from as Square);
  return next;
};

export interface Look {
  box: number;
  squares: Square[];
  check: boolean;
  stalemate: boolean;
  /** An attacker's piece next to the lone king with nothing defending it. */
  hanging: Square | null;
}

/** The lone king's situation. Its square is emptied first, so a square behind it on a line of attack counts as attacked. */
function look(board: Board, lone: Color): Look {
  const king = kingOf(board, lone);
  const rest = new Map(board);
  rest.delete(king);
  const attacker = other(lone);
  const hit = attacks(rest, attacker);
  const ours = (sq: Square) => rest.has(sq) && colorOf(rest.get(sq)!) === attacker;
  const free = (sq: Square) => !hit.has(sq) && !ours(sq);
  const seen = new Set<Square>([king]);
  const queue = [king];
  while (queue.length) {
    for (const n of neighbours(queue.shift()!)) {
      if (!seen.has(n) && free(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  const around = neighbours(king);
  const hanging = around.find((sq) => ours(sq) && !hit.has(sq)) ?? null;
  const check = hit.has(king);
  return { box: seen.size, squares: [...seen], check, stalemate: !check && !hanging && around.every((sq) => !free(sq)), hanging };
}

/** How many squares the lone king's box has in a position. */
export function boxSize(fen: string): number {
  const { board, turn } = parse(fen);
  return look(board, other(turn)).box;
}

/** The lone king's situation when it is its turn: for the validator, which checks it against chess.js. */
export function loneKingToMove(fen: string): Look {
  const { board, turn } = parse(fen);
  return look(board, turn);
}

/** The squares of the lone king's box, to draw it on a board. */
export function boxSquares(fen: string): Square[] {
  const { board, turn } = parse(fen);
  return look(board, other(turn)).squares;
}

/** How far apart the two kings stand, in king steps. */
export function kingsApart(fen: string): number {
  const { board } = parse(fen);
  return kingDistance(kingOf(board, "w"), kingOf(board, "b"));
}

/** A piece of the side to move that the lone king threatens to take. */
export function threatenedPiece(fen: string): Square | null {
  const { board, turn } = parse(fen);
  return look(board, other(turn)).hanging;
}

/** "`Qd4` (dama para d4)" in RichText markup. */
const moveLabel = (m: Move) => `\`${m.san}\` (${readMove(m)})`;

const casas = (n: number) => `${n} ${n === 1 ? "casa" : "casas"}`;

function flaw(move: Move, l: Look): string | null {
  if (l.stalemate) return `Depois de ${moveLabel(move)}, o rei não tem lances e não está em xeque: afogamento, empate.`;
  if (l.hanging) return `Depois de ${moveLabel(move)}, o rei captura a peça em \`${l.hanging}\`, que ficou sem proteção.`;
  return null;
}

/**
 * How a move is judged:
 * - smallest: the smallest box any safe move reaches (the rook's cut);
 * - knight: the queen at a knight's jump from the king, shrinking the box, or a move as good as the best such jump;
 * - check: a check that shrinks the box (a step of the two rooks' ladder);
 * - keep: anything safe that does not grow the box (saving a threatened piece).
 */
export type BoxRule = "smallest" | "knight" | "check" | "keep";

export interface BoxJudge {
  accept: (move: Move, after: Chess) => boolean;
  wrong: (move: Move) => string;
  success: (move: Move) => string;
  /** Every accepted move, in UCI. */
  answers: string[];
  before: number;
  /** The smallest box an accepted move leaves (Infinity with none). */
  bestAfter: number;
}

function judge(fen: string, ok: (move: Step, l: Look) => boolean, wrong: (move: Move, l: Look) => string, success: (l: Look) => string): BoxJudge {
  const { board, turn } = parse(fen);
  const lone = other(turn);
  const lookAfter = (m: Pick<Move, "from" | "to">) => look(played(board, m), lone);
  const good = movesOf(board, turn)
    .map((m) => ({ m, l: lookAfter(m) }))
    .filter(({ m, l }) => ok(m, l));
  return {
    before: look(board, lone).box,
    answers: good.map(({ m }) => `${m.from}${m.to}`),
    bestAfter: Math.min(...good.map(({ l }) => l.box)),
    accept: (move) => ok(move, lookAfter(move)),
    wrong: (move) => {
      const l = lookAfter(move);
      return flaw(move, l) ?? wrong(move, l);
    },
    success: (move) => success(lookAfter(move)),
  };
}

/** Shrinking the box with the pieces, never the king. `pieces` names them in the feedback ("a dama", "uma torre"). */
export function judgeShrink(fen: string, pieces: string, rule: BoxRule): BoxJudge {
  const { board, turn } = parse(fen);
  const lone = other(turn);
  const loneKing = kingOf(board, lone);
  const before = look(board, lone).box;
  const safe = movesOf(board, turn)
    .filter((m) => m.piece !== "k")
    .map((m) => ({ m, l: look(played(board, m), lone) }))
    .filter(({ l }) => !l.stalemate && !l.hanging);
  const best = Math.min(...safe.map(({ l }) => l.box));
  const jump = (m: Step, l: Look) => l.box < before && isKnightJump(m.to as Square, loneKing);
  const knight = Math.min(...safe.filter(({ m, l }) => jump(m, l)).map(({ l }) => l.box));
  const limit = rule === "keep" ? before : rule === "knight" && Number.isFinite(knight) ? knight : best;

  const fits = (m: Step, l: Look) => (rule === "check" ? l.check && l.box < before : l.box <= limit || (rule === "knight" && jump(m, l)));
  const ok = (m: Step, l: Look) => m.piece !== "k" && !l.stalemate && !l.hanging && fits(m, l);
  const wrong = (m: Move, l: Look) => {
    if (m.piece === "k") return `Agora quem joga é ${pieces}: o seu rei entra depois.`;
    if (rule === "keep") return `Depois de ${moveLabel(m)}, a caixa cresce: o rei fica com ${casas(l.box)}.`;
    if (rule === "check")
      return l.check
        ? `Depois de ${moveLabel(m)}, o rei fica com ${casas(l.box)}: a caixa não encolheu.`
        : `Depois de ${moveLabel(m)}, o rei não recua: é o xeque que o empurra.`;
    return limit === best
      ? `Depois de ${moveLabel(m)}, o rei fica com ${casas(l.box)}. Dá para deixar só ${casas(limit)}.`
      : `Depois de ${moveLabel(m)}, o rei fica com ${casas(l.box)}. Dá para deixar com ${casas(limit)} ou menos.`;
  };
  return judge(fen, ok, wrong, (l) => `O rei ficou com ${casas(l.box)}.`);
}

const isKnightJump = (a: Square, b: Square) => {
  const df = Math.abs(fileIndex(a) - fileIndex(b));
  const dr = Math.abs(rankOf(a) - rankOf(b));
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
};

/** Bringing the king: a king move that gets closer to the lone king without growing the box. */
export function judgeApproach(fen: string, pieces: string): BoxJudge {
  const { board, turn } = parse(fen);
  const loneKing = kingOf(board, other(turn));
  const ownKing = kingOf(board, turn);
  const before = look(board, other(turn)).box;
  const closer = (m: Step) => kingDistance(m.to as Square, loneKing) < kingDistance(ownKing, loneKing);
  const ok = (m: Step, l: Look) => m.piece === "k" && closer(m) && !l.stalemate && !l.hanging && l.box <= before;
  const wrong = (m: Move, l: Look) => {
    if (m.piece !== "k") return `A caixa já está pequena: agora quem anda é o seu rei, e ${pieces} espera.`;
    if (!closer(m)) return `Com ${moveLabel(m)}, o seu rei não chega mais perto do outro.`;
    return `Depois de ${moveLabel(m)}, a caixa cresce: o rei fica com ${casas(l.box)}.`;
  };
  return judge(fen, ok, wrong, () => "O seu rei chegou mais perto, e a caixa continua fechada.");
}
