/* Checks for screens where pieces move. */
import { Chess } from "chess.js";
import { isLegalPosition } from "@/content/lib/positions";
import type { MoveBasedScreen } from "@/content/types";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";
import { legalMoves, load, parseUci, pieceColorAt, play, playLine, solvePath, turnOf } from "@/lib/chess/game";
import { forcedMate } from "@/lib/chess/search";

function checkRich(where: string, text: string | undefined, errors: string[]) {
  if (!text) return;
  if ((text.match(/`/g) ?? []).length % 2) errors.push(`${where}: unbalanced backticks in "${text}"`);
  if ((text.match(/\*\*/g) ?? []).length % 2) errors.push(`${where}: unbalanced ** in "${text}"`);
  if (/\u2014|\u2013/.test(text)) errors.push(`${where}: dash character in "${text}"`);
}

export function validateScreen(where: string, s: MoveBasedScreen, errors: string[]): void {
  checkRich(where, s.prompt, errors);
  if (typeof s.success === "string") checkRich(where, s.success, errors);
  let game: Chess;
  try {
    game = load(s.board.fen);
  } catch (e) {
    errors.push(`${where}: FEN does not load: ${s.board.fen} (${(e as Error).message})`);
    return;
  }
  if (!legalMoves(s.board.fen).length) errors.push(`${where}: no legal moves in ${s.board.fen}`);
  const placementField = s.board.fen.split(" ")[0];
  if (placementField.includes("K") && placementField.includes("k")) {
    if (!isLegalPosition(s.board.fen)) errors.push(`${where}: illegal position ${s.board.fen}`);
  }
  switch (s.kind) {
    case "move": {
      const sol = parseUci(s.solution);
      const played = play(s.board.fen, sol);
      if (!played) {
        errors.push(`${where}: solution ${s.solution} is illegal in ${s.board.fen}`);
        return;
      }
      if (!s.accept(played.move, played.game)) errors.push(`${where}: solution ${s.solution} is not accepted`);
      const all = legalMoves(s.board.fen);
      const accepted = all.filter((m) => {
        const p = play(s.board.fen, { from: m.from as Square, to: m.to as Square, promotion: m.promotion });
        return p && s.accept(p.move, p.game);
      });
      if (accepted.length === all.length && all.length > 1 && !s.key.startsWith("livre:"))
        errors.push(`${where}: every legal move is accepted (${all.length})`);
      for (const m of all) {
        const p = play(s.board.fen, { from: m.from as Square, to: m.to as Square, promotion: m.promotion });
        if (p && !s.accept(p.move, p.game) && s.wrong) checkRich(where, s.wrong(p.move), errors);
      }
      return;
    }
    case "path": {
      const player = turnOf(s.board.fen);
      const pieces = ALL_SQUARES.filter((sq) => pieceColorAt(s.board.fen, sq as Square) === player);
      if (pieces.length !== 1) errors.push(`${where}: path needs exactly one player piece, found ${pieces.length}`);
      if (!s.targets.length) errors.push(`${where}: no targets`);
      const sol = solvePath(s.board.fen, pieces[0] as Square, s.targets);
      if (!sol) errors.push(`${where}: path not solvable: ${s.board.fen} targets ${s.targets}`);
      else if (s.par !== undefined && s.par !== sol.length) errors.push(`${where}: par ${s.par} but solver needs ${sol.length}`);
      for (const t of s.targets) if (pieceColorAt(s.board.fen, t) === player) errors.push(`${where}: target ${t} holds a player piece`);
      return;
    }
    case "sequence": {
      const res = playLine(s.board.fen, s.line);
      if (!res) {
        errors.push(`${where}: line does not play: ${s.line.join(" ")} from ${s.board.fen}`);
        return;
      }
      if (s.anyMateAtEnd) {
        const g = load(res.fens[res.fens.length - 1]);
        if (!g.isCheckmate()) errors.push(`${where}: anyMateAtEnd but line does not end in mate`);
      }
      if (s.line.length % 2 === 0) errors.push(`${where}: line should end with a player move (odd length)`);
      const userPlies = Math.ceil(s.line.length / 2);
      if (s.comments && s.comments.length > userPlies) errors.push(`${where}: more comments than player moves`);
      s.comments?.forEach((c) => checkRich(where, c, errors));
      return;
    }
    case "play": {
      if (!isLegalPosition(s.board.fen)) errors.push(`${where}: play position must be a full legal position`);
      if (game.isGameOver()) errors.push(`${where}: play position is already over`);
      if (s.mateIn && !forcedMate(s.board.fen, s.mateIn)) errors.push(`${where}: no forced mate in ${s.mateIn}: ${s.board.fen}`);
      if (s.mateIn && s.maxMoves < s.mateIn) errors.push(`${where}: maxMoves below mateIn`);
      return;
    }
  }
}
