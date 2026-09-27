import { Chess, type Move } from "chess.js";
import { judge } from "@shared/analysis";
import { replay } from "@shared/games";
import type { Game, PositionEval } from "@shared/types";
import { parseUci, type Color } from "@/lib/chess/game";
import { PIECE_NAME, PIECE_VALUE, materialFor } from "@/lib/chess/material";

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

/** Mates in the evaluation, from `color`'s side: moves to mate, positive for `color`, 0 for none. */
function mateFor(e: PositionEval, color: Color): number {
  if (!("mate" in e)) return 0;
  return color === "w" ? e.mate : -e.mate;
}

/**
 * The sentence for the move that led to position `ply` (1 is White's first
 * move), or null when the move is not judged or the lines show nothing sure.
 */
export function explainMove(game: Game, ply: number): string | null {
  const analysis = game.analysis;
  if (!analysis || ply < 1 || ply >= analysis.length) return null;
  const before = analysis[ply - 1];
  const after = analysis[ply];
  const mover: Color = ply % 2 === 1 ? "w" : "b";
  if (!judge(before, after, mover)) return null;

  const mateAfter = mateFor(after, mover);
  if (mateAfter < 0) return `Permite mate em ${-mateAfter}.`;
  const mateBefore = mateFor(before, mover);
  if (mateBefore > 0 && mateAfter <= 0) return `Deixava escapar um mate em ${mateBefore}.`;

  // Material needs both lines: the one after the move played (the reply to
  // it) and the best one from the position before.
  if (!before.pv?.length || !after.pv) return null;
  const start = replay(game.moves.slice(0, ply - 1));
  if (!start) return null;
  const fen = start.fen();
  const played = playLine(fen, [game.moves[ply - 1], ...after.pv], mover);
  const best = playLine(fen, before.pv, mover);
  if (best.net - played.net < MATERIAL_MARGIN) return null;

  if (played.net <= -MATERIAL_MARGIN) {
    // A pawn for a pawn is no part of the story: like for like cancels out.
    const lost = [...played.lost];
    const won = played.won.filter((p) => {
      const i = lost.indexOf(p);
      if (i < 0) return true;
      lost.splice(i, 1);
      return false;
    });
    if (lost.length) return won.length ? `Perde ${namePieces(lost)} e ganha só ${namePieces(won)}.` : `Perde ${namePieces(lost)}.`;
  }
  if (best.net >= MATERIAL_MARGIN && best.won.length) return `Deixava de ganhar ${namePieces(best.won)}.`;
  return null;
}
