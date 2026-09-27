import { replay } from "@shared/games";
import type { Game, GameEndReason } from "@shared/types";

/** PGN's result tokens, from White's side. */
function resultOf(game: Game): string {
  if (!game.outcome) return "*";
  if (game.outcome === "draw") return "1/2-1/2";
  const whiteWon = (game.outcome === "win") === (game.player === "w");
  return whiteWon ? "1-0" : "0-1";
}

/** The PGN Termination tag: "normal" when the rules ended it. */
const TERMINATION: Record<GameEndReason, string> = {
  checkmate: "normal",
  stalemate: "normal",
  insufficient: "normal",
  repetition: "normal",
  fifty: "normal",
  resigned: "abandoned",
};

/** `2026.09.27`, the PGN date. */
function pgnDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/**
 * The game in PGN (Portable Game Notation), the text every analysis board
 * imports (Lichess, chess.com, ChessBase). The seven required tags, the
 * computer's level as its Elo, and the moves in SAN.
 */
export function gamePgn(game: Game): string {
  const chess = replay(game.moves);
  if (!chess) return "";
  const you = "Você";
  const computer = `Computador ${game.level}`;
  chess.setHeader("Event", game.assisted ? "Partida assistida contra o computador" : "Partida contra o computador");
  chess.setHeader("Site", "Lance a Lance");
  chess.setHeader("Date", pgnDate(game.startedAt));
  chess.setHeader("Round", "-");
  chess.setHeader("White", game.player === "w" ? you : computer);
  chess.setHeader("Black", game.player === "b" ? you : computer);
  chess.setHeader("Result", resultOf(game));
  chess.setHeader(game.player === "w" ? "BlackElo" : "WhiteElo", String(game.level));
  if (game.reason) chess.setHeader("Termination", TERMINATION[game.reason]);
  return chess.pgn({ maxWidth: 80 }) + "\n";
}

/** `lance-a-lance-2026-09-27.pgn` */
export function pgnFileName(game: Game): string {
  return `lance-a-lance-${pgnDate(game.startedAt).replaceAll(".", "-")}.pgn`;
}
