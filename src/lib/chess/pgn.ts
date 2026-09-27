import { Chess } from "chess.js";
import { replay } from "@shared/games";
import { GLYPH, judgements } from "@shared/analysis";
import type { Game, GameEndReason } from "@shared/types";
import { parseUci } from "@/lib/chess/game";
import { JUDGEMENT_WORD } from "@/lib/chess/judgement";

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

/** A tag value, with the two characters PGN escapes. */
const tag = (name: string, value: string) => `[${name} "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;

/** Joins tokens into lines of at most 80 characters, as PGN export asks. */
function wrap(tokens: string[]): string {
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (line && line.length + 1 + token.length > 80) {
      lines.push(line);
      line = token;
    } else {
      line = line ? `${line} ${token}` : token;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

/**
 * The game in PGN (Portable Game Notation), the text every analysis board
 * imports (Lichess, chess.com, ChessBase): the seven required tags, the
 * computer's level as its Elo, and the moves in SAN. An analysed game also
 * carries each judged move's NAG ($6 ?!, $2 ?, $4 ??) and a comment with the
 * engine's move, as Lichess exports them.
 */
export function gamePgn(game: Game): string {
  const chess = replay(game.moves);
  if (!chess) return "";
  const you = "Você";
  const computer = `Computador ${game.level}`;
  const headers = [
    tag("Event", game.assisted ? "Partida assistida contra o computador" : "Partida contra o computador"),
    tag("Site", "Lance a Lance"),
    tag("Date", pgnDate(game.startedAt)),
    tag("Round", "-"),
    tag("White", game.player === "w" ? you : computer),
    tag("Black", game.player === "b" ? you : computer),
    tag("Result", resultOf(game)),
    tag(game.player === "w" ? "BlackElo" : "WhiteElo", String(game.level)),
    ...(game.reason ? [tag("Termination", TERMINATION[game.reason])] : []),
  ];

  const sans = chess.history();
  const marks = game.analysis ? judgements(game.analysis) : [];
  const board = new Chess();
  const tokens: string[] = [];
  let afterComment = false;
  sans.forEach((san, i) => {
    const number = Math.floor(i / 2) + 1;
    if (i % 2 === 0) tokens.push(`${number}.`);
    else if (afterComment) tokens.push(`${number}...`);
    tokens.push(san);
    afterComment = false;
    const mark = marks[i];
    const best = game.analysis?.[i]?.best;
    if (mark) {
      tokens.push(`$${GLYPH[mark].nag}`);
      if (best) {
        const bestSan = new Chess(board.fen()).move(parseUci(best)).san;
        tokens.push(`{ ${JUDGEMENT_WORD[mark]}. Melhor era ${bestSan}. }`);
        afterComment = true;
      }
    }
    board.move(san);
  });
  tokens.push(resultOf(game));

  return `${headers.join("\n")}\n\n${wrap(tokens)}\n`;
}

/** `lance-a-lance-2026-09-27.pgn` */
export function pgnFileName(game: Game): string {
  return `lance-a-lance-${pgnDate(game.startedAt).replaceAll(".", "-")}.pgn`;
}
