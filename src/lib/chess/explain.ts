import { Chess, type Move } from "chess.js";
import { judgeMove } from "@shared/analysis";
import { replay } from "@shared/games";
import type { Game, PositionEval } from "@shared/types";
import { parseUci, type Color } from "@/lib/chess/game";
import { PIECE_NAME, PIECE_VALUE, materialFor } from "@/lib/chess/material";
import { describeMove } from "@/lib/chess/notation";

/**
 * Why a judged move was bad, in one sentence, read off the lines the engine
 * calculated: a mate let in, a mate let slip, material lost or material left
 * on the table. Only what the lines show for certain; anything else (the
 * positional reasons no engine puts into words) gets no sentence at all.
 */

type PieceType = keyof typeof PIECE_VALUE;

/** At least this much material, in pawns, before a line counts as winning or losing some. */
const MATERIAL_MARGIN = 2;

const PLURAL: Record<PieceType, { word: string; feminine: boolean }> = {
  p: { word: "peões", feminine: false },
  n: { word: "cavalos", feminine: false },
  b: { word: "bispos", feminine: false },
  r: { word: "torres", feminine: true },
  q: { word: "damas", feminine: true },
  k: { word: "reis", feminine: false },
};

const COUNT = ["", "", "dois", "três", "quatro", "cinco", "seis", "sete", "oito"];

/** "um cavalo e dois peões": pieces by value, largest first. */
function namePieces(pieces: PieceType[]): string {
  const counts = new Map<PieceType, number>();
  for (const p of pieces) counts.set(p, (counts.get(p) ?? 0) + 1);
  const names = [...counts.entries()]
    .sort(([a], [b]) => PIECE_VALUE[b] - PIECE_VALUE[a])
    .map(([p, n]) => {
      if (n === 1) return PIECE_NAME[p];
      const { word, feminine } = PLURAL[p];
      const count = n === 2 && feminine ? "duas" : (COUNT[n] ?? String(n));
      return `${count} ${word}`;
    });
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}` : names[0];
}

/**
 * Plays a line from a position for as long as it stays legal: the material it
 * changes for `color`, and what each side took. The count stops at the line's
 * last quiet move: a line cut off in the middle of a trade (a queen taken, the
 * recapture past the end) would otherwise read as a piece won.
 */
function playLine(fen: string, line: string[], color: Color) {
  const chess = new Chess(fen);
  const lost: PieceType[] = [];
  const won: PieceType[] = [];
  let settled = { net: 0, lost: [] as PieceType[], won: [] as PieceType[] };
  for (const uci of line) {
    let move: Move;
    try {
      move = chess.move(parseUci(uci));
    } catch {
      break;
    }
    if (move.captured) (move.color === color ? won : lost).push(move.captured as PieceType);
    else settled = { net: materialFor(chess.fen(), color) - materialFor(fen, color), lost: [...lost], won: [...won] };
  }
  return settled;
}

/** Takes like for like out of a trade: a pawn for a pawn is no part of the story. */
function netOut(gone: PieceType[], taken: PieceType[]) {
  const rest = [...gone];
  const kept = taken.filter((p) => {
    const i = rest.indexOf(p);
    if (i < 0) return true;
    rest.splice(i, 1);
    return false;
  });
  return { gone: rest, taken: kept };
}

/** Mates in the evaluation, from `color`'s side: moves to mate, positive for `color`, 0 for none. */
function mateFor(e: PositionEval, color: Color): number {
  if (!("mate" in e)) return 0;
  return color === "w" ? e.mate : -e.mate;
}

/** `a` without one of each piece in `b`: what one line has that the other does not. */
function without(a: PieceType[], b: PieceType[]): PieceType[] {
  const rest = [...b];
  return a.filter((p) => {
    const i = rest.indexOf(p);
    if (i < 0) return true;
    rest.splice(i, 1);
    return false;
  });
}

/** An evaluation in centipawns from `color`'s side, or null for a mate. */
function cpFor(e: PositionEval, color: Color): number | null {
  if ("mate" in e) return null;
  return color === "w" ? e.cp : -e.cp;
}

/** A winning advantage, in centipawns, and what counts as level. */
const WINNING = 300;
const LEVEL = 50;

/**
 * The sentence for the move that led to position `ply` (1 is White's first
 * move), or null when the move is not judged or the lines show nothing sure.
 * It names the move and whose it was ("Com Kf2, você…", "Com d5, o
 * computador…"), since each side is judged from its own point of view, and
 * material is counted against the engine's best line, not in absolute terms:
 * a move can lose two rooks and still be better than every other.
 */
export function explainMove(game: Game, ply: number): string | null {
  const analysis = game.analysis;
  if (!analysis || ply < 1 || ply >= analysis.length) return null;
  const before = analysis[ply - 1];
  const after = analysis[ply];
  const mover: Color = ply % 2 === 1 ? "w" : "b";
  if (!judgeMove(analysis, game.moves, ply)) return null;
  const start = replay(game.moves.slice(0, ply - 1));
  if (!start) return null;
  const fen = start.fen();
  const san = new Chess(fen).move(parseUci(game.moves[ply - 1])).san;
  // Plain words for somebody still learning: who, and what it means for them.
  const mine = mover === game.player;
  const who = mine ? "você" : "o computador";
  const Who = mine ? "Você" : "O computador";
  const other = mine ? "o computador" : "você";
  const inMoves = (n: number) => (n === 1 ? "no lance seguinte" : `em ${n} lances`);

  // A mate let in: whose move let it in, who gets it, and the move it starts with.
  const mateAfter = mateFor(after, mover);
  if (mateAfter < 0) {
    const n = -mateAfter;
    let first = "";
    if (after.best) {
      try {
        const board = new Chess(fen);
        board.move(parseUci(game.moves[ply - 1]));
        first = `${n === 1 ? ", com" : ", começando por"} ${describeMove(board.move(parseUci(after.best)))}`;
      } catch {
        first = "";
      }
    }
    return `Com ${san}, ${who} deixa ${other} dar xeque-mate ${inMoves(n)}${first}.`;
  }
  const mateBefore = mateFor(before, mover);
  if (mateBefore > 0 && mateAfter <= 0) {
    return `${Who} tinha xeque-mate ${mateBefore === 1 ? "no lance" : `em ${mateBefore} lances`} e deixou escapar com ${san}.`;
  }

  // A won position turned level: that is the story, whatever the material.
  const was = cpFor(before, mover);
  const now = cpFor(after, mover);
  if (was !== null && now !== null && was >= WINNING && Math.abs(now) <= LEVEL) return `${Who} estava ganhando, e com ${san} o jogo fica equilibrado.`;

  // Material needs both lines: the one after the move played (the reply to
  // it) and the best one from the position before.
  if (!before.pv?.length || !after.pv) return null;
  const played = playLine(fen, [game.moves[ply - 1], ...after.pv], mover);
  const best = playLine(fen, before.pv, mover);
  if (best.net - played.net < MATERIAL_MARGIN) return null;

  // What the move played gives up that the best line does not, and what the
  // best line would have taken that the move played does not.
  // Each line nets out its own like-for-like trades first.
  const p = netOut(played.lost, played.won);
  const b = netOut(best.lost, best.won);
  const { gone: lost, taken: backInstead } = netOut(without(p.gone, b.gone), without(p.taken, b.taken));
  const missed = without(b.taken, p.taken);
  const bestAlsoLoses = b.gone.length > 0;
  const bestSan = before.best ? new Chess(fen).move(parseUci(before.best)).san : null;
  const parts: string[] = [];
  if (lost.length) {
    const more = bestAlsoLoses && bestSan ? ` a mais do que com ${bestSan}` : "";
    parts.push(`perde ${namePieces(lost)}${more}${backInstead.length ? ` e só ganha ${namePieces(backInstead)} em troca` : ""}`);
  }
  if (missed.length) parts.push(`deixa de ganhar ${namePieces(missed)}`);
  return parts.length ? `Com ${san}, ${who} ${parts.join(" e ")}.` : null;
}

/**
 * Why the engine's best move is best, for the assisted game, from its line and
 * its score from the side to move (`color`): a mate it leads to, or material
 * the line wins. Null when the line shows nothing that sure.
 */
export function explainBest(fen: string, pv: string[], score: { cp: number } | { mate: number }, color: Color): string | null {
  if ("mate" in score && score.mate > 0) return score.mate === 1 ? "Dá xeque-mate." : `Leva a xeque-mate em ${score.mate} lances.`;
  const line = playLine(fen, pv, color);
  if (line.net < MATERIAL_MARGIN) return null;
  const { gone: won, taken: lost } = netOut(line.won, line.lost);
  if (!won.length) return null;
  return lost.length ? `Ganha ${namePieces(won)} e só perde ${namePieces(lost)} em troca.` : `Ganha ${namePieces(won)}.`;
}
