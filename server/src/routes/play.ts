import { createHash, timingSafeEqual } from "node:crypto";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { Chess, type Move } from "chess.js";
import { RATED_AFTER } from "../../../shared/scoring.js";
import { GAME_LEVELS, UCI, levelByRating, levelNear, replay } from "../../../shared/games.js";
import { PIECE_VALUE, materialFor } from "../../../shared/material.js";
import { readMove } from "../../../shared/notation.js";
import { GAME_COLUMNS, type GameRow } from "../account.js";
import { pool, query, transaction } from "../db.js";
import { computerMove } from "../engine.js";
import { env } from "../env.js";
import { finishGame, openGame } from "../games.js";
import type { Vars } from "./auth.js";
import { brazilDay } from "./util.js";

/**
 * Playing against the computer from another client (an MCP server, a script),
 * at /api/v1. A key from USER_API_KEYS, sent as a Bearer token, stands for the
 * account with its email. Every answer is `{ success, data }`.
 *
 * It is the same game the app plays: one open game per person, the same
 * levels, rated the same way. The difference is who moves the computer: here
 * the server does, before answering, so a move comes back with the reply. The
 * app's game screen asks for the open game every few seconds and picks the
 * moves up. Documented in docs/API.md.
 */
export const playRoutes = new Hono<Vars>();

const ok = (c: Context, data: object, status: 200 | 201 = 200) => c.json({ success: true, data }, status);
const fail = (c: Context, status: 400 | 401 | 404 | 409 | 500 | 503, error: string, message: string, extra: object = {}) =>
  c.json({ success: false, data: { error, message, ...extra } }, status);

playRoutes.onError((error, c) => {
  console.error("api request failed:", error);
  return fail(c, 500, "server_error", "Something went wrong on the server.");
});

const digest = (value: string) => createHash("sha256").update(value).digest();

/** The account behind the Bearer key, compared in constant time. */
const requireKey: MiddlewareHandler<Vars> = async (c, next) => {
  if (!env.apiKeys.length) return fail(c, 404, "not_found", "The API is off on this server.");
  const token = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
  const given = token ? digest(token) : null;
  const entry = given ? env.apiKeys.find((k) => timingSafeEqual(digest(k.key), given)) : undefined;
  const user = entry
    ? (await query<{ id: string; email: string; isAdmin: boolean }>('SELECT id, email, is_admin AS "isAdmin" FROM users WHERE email = $1', [entry.email])).rows[0]
    : undefined;
  if (!user) return fail(c, 401, "unauthorized", "Missing or unknown API key.");
  c.set("user", user);
  await next();
};

playRoutes.use("*", requireKey);

/* ---------- one request per person at a time ---------- */

const locks = new Map<string, Promise<unknown>>();

/** Runs `work` after every earlier request of the same person, so two moves never race. */
function serially<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const run = (locks.get(userId) ?? Promise.resolve()).then(work);
  const tail = run.catch(() => undefined);
  locks.set(userId, tail);
  void tail.then(() => locks.get(userId) === tail && locks.delete(userId));
  return run;
}

/* ---------- what a client needs to show the game ---------- */

type Color = "w" | "b";
const COLOR = { w: "white", b: "black" } as const;
type Status = "none" | "player" | "computer" | "victory" | "defeat" | "draw" | "cancelled";

const uciOf = (m: Pick<Move, "from" | "to" | "promotion">) => m.from + m.to + (m.promotion ?? "");

function statusOf(game: GameRow, turn: Color): Status {
  if (game.outcome === "win") return "victory";
  if (game.outcome === "loss") return "defeat";
  if (game.outcome === "draw") return "draw";
  return turn === game.player ? "player" : "computer";
}

/** The game as PGN, with the tags the app's export uses. */
function pgnOf(game: GameRow, chess: Chess): string {
  const you = "Você";
  const computer = `Computador ${game.level}`;
  const whiteWon = (game.outcome === "win") === (game.player === "w");
  const result = !game.outcome ? "*" : game.outcome === "draw" ? "1/2-1/2" : whiteWon ? "1-0" : "0-1";
  const d = game.started_at;
  const pad = (n: number) => String(n).padStart(2, "0");
  chess.setHeader("Event", game.assisted ? "Partida assistida contra o computador" : "Partida contra o computador");
  chess.setHeader("Site", "Lance a Lance");
  chess.setHeader("Date", `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`);
  chess.setHeader("Round", "-");
  chess.setHeader("White", game.player === "w" ? you : computer);
  chess.setHeader("Black", game.player === "b" ? you : computer);
  chess.setHeader("Result", result);
  chess.setHeader(game.player === "w" ? "BlackElo" : "WhiteElo", String(game.level));
  if (game.reason) chess.setHeader("Termination", game.reason === "resigned" ? "abandoned" : "normal");
  return chess.pgn();
}

function view(game: GameRow) {
  const chess = replay(game.moves)!;
  const turn = chess.turn();
  const status = statusOf(game, turn);
  const by = (color: Color) => (color === game.player ? "player" : "computer");
  const history = chess.history({ verbose: true }).map((m, i) => ({
    ply: i + 1,
    by: by(m.color),
    color: COLOR[m.color],
    san: m.san,
    uci: uciOf(m),
    from: m.from,
    to: m.to,
    reading: readMove(m),
  }));

  const pieces: Record<string, { pieceType: string }> = {};
  let check: string | null = null;
  const total = { w: 0, b: 0 };
  for (const rank of chess.board()) {
    for (const cell of rank) {
      if (!cell) continue;
      pieces[cell.square] = { pieceType: `${cell.color}${cell.type.toUpperCase()}` };
      total[cell.color] += PIECE_VALUE[cell.type];
      if (cell.type === "k" && cell.color === turn && chess.inCheck()) check = cell.square;
    }
  }

  return {
    status,
    game: {
      id: game.id,
      level: game.level,
      assisted: game.assisted,
      player: COLOR[game.player],
      computer: COLOR[game.player === "w" ? "b" : "w"],
      turn: COLOR[turn],
      ply: game.moves.length,
      fen: chess.fen(),
      pieces,
      check,
      lastMove: history[history.length - 1] ?? null,
      moves: history,
      legalMoves: status === "player" ? chess.moves({ verbose: true }).map((m) => ({ san: m.san, uci: uciOf(m), from: m.from, to: m.to })) : [],
      material: { white: total.w, black: total.b, balance: materialFor(chess.fen(), game.player) },
      result: game.outcome
        ? { outcome: game.outcome, reason: game.reason, ratingDelta: game.rating_delta, ratingAfter: game.rating_after, xp: game.xp }
        : null,
      pgn: pgnOf(game, chess),
      startedAt: game.started_at.toISOString(),
      finishedAt: game.finished_at?.toISOString() ?? null,
    },
  };
}

/* ---------- moving ---------- */

class EngineDown extends Error {}

/**
 * Saves `moves` on top of `game` as it was read, and ends the game when the
 * rules do. Null when the game changed in between (the app moved it): the
 * caller reads it again.
 */
async function commit(userId: string, game: GameRow, moves: string[]): Promise<GameRow | null> {
  return transaction(async (client) => {
    const now = await openGame(client, userId, true);
    if (now?.id !== game.id || now.moves.join() !== game.moves.join()) return null;
    const done = await finishGame(client, userId, now, moves, false, brazilDay());
    if (done) return done;
    const { rows } = await client.query<GameRow>(`UPDATE games SET moves = $2, updated_at = now() WHERE id = $1 RETURNING ${GAME_COLUMNS}`, [
      game.id,
      moves,
    ]);
    return rows[0];
  });
}

/** The computer's move appended to `moves`, which leave it to play. */
async function withReply(game: GameRow, moves: string[]): Promise<string[]> {
  const chess = replay(moves)!;
  if (chess.isGameOver() || chess.turn() === game.player) return moves;
  try {
    return [...moves, await computerMove(chess, moves, levelByRating(game.level) ?? levelNear(game.level))];
  } catch (error) {
    console.error("engine failed:", error);
    throw new EngineDown();
  }
}

/**
 * The open game with the computer's move played when it is the computer's
 * turn: a game created as Black, or one the app left there.
 */
async function settled(userId: string, game: GameRow): Promise<GameRow> {
  if (game.finished_at) return game;
  const moves = await withReply(game, game.moves);
  if (moves === game.moves) return game;
  return (await commit(userId, game, moves)) ?? (await openGame(pool, userId)) ?? game;
}

/** A move as SAN (`Nf3`, `O-O`, `e8=Q`) or UCI (`g1f3`, `e7e8q`), played on `chess`; null when illegal. */
function parseMove(chess: Chess, raw: string): Move | null {
  const text = raw.trim();
  try {
    if (UCI.test(text)) return chess.move({ from: text.slice(0, 2), to: text.slice(2, 4), promotion: text[4] });
    return chess.move(text.replace(/0-0-0/g, "O-O-O").replace(/0-0/g, "O-O"));
  } catch {
    return null;
  }
}

const engineDown = (c: Context) => fail(c, 503, "engine_unavailable", "The computer could not answer. Nothing was saved; try again.");

/* ---------- routes ---------- */

/** The open game, or the last one that ended, or none at all. */
playRoutes.get("/game", async (c) => {
  const userId = c.get("user").id;
  try {
    return await serially(userId, async () => {
      const open = await openGame(pool, userId);
      if (open) return ok(c, view(await settled(userId, open)));
      const { rows } = await query<GameRow>(
        `SELECT ${GAME_COLUMNS} FROM games WHERE user_id = $1 AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`,
        [userId],
      );
      return ok(c, rows[0] ? view(rows[0]) : { status: "none", game: null });
    });
  } catch (error) {
    if (error instanceof EngineDown) return engineDown(c);
    throw error;
  }
});

/** A new game: `level` as in the app, `color` white, black or random. Always rated, as in the app without assistance. */
playRoutes.post("/game", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { level?: unknown; color?: unknown } | null;
  if (!GAME_LEVELS.includes(body?.level as never)) {
    return fail(c, 400, "invalid_level", `level must be one of ${GAME_LEVELS.join(", ")}.`);
  }
  const color = body?.color ?? "random";
  if (color !== "white" && color !== "black" && color !== "random") {
    return fail(c, 400, "invalid_color", "color must be white, black or random.");
  }
  const player: Color = color === "white" ? "w" : color === "black" ? "b" : Math.random() < 0.5 ? "w" : "b";
  const userId = c.get("user").id;
  return serially(userId, async () => {
    const { rows } = await query<GameRow>(
      `INSERT INTO games (user_id, level, player, assisted) VALUES ($1, $2, $3, false)
       ON CONFLICT (user_id) WHERE finished_at IS NULL DO NOTHING
       RETURNING ${GAME_COLUMNS}`,
      [userId, body!.level, player],
    );
    if (!rows[0]) {
      const open = await openGame(pool, userId);
      return fail(c, 409, "game_open", "There is a game in progress already. Finish it, resign or cancel it first.", open ? view(open) : {});
    }
    try {
      return ok(c, view(await settled(userId, rows[0])), 201);
    } catch (error) {
      // The game exists; the computer's first move is played on the next read.
      if (error instanceof EngineDown) return ok(c, view(rows[0]), 201);
      throw error;
    }
  });
});

/**
 * The player's move, and the computer's reply, in one answer. `ply` is the
 * number of moves played before this one, as the game read showed it: a retry
 * of a move that already went through answers with the game instead of an
 * error, and a move meant for an older position is refused.
 */
playRoutes.post("/game/move", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { move?: unknown; ply?: unknown } | null;
  if (typeof body?.move !== "string" || !body.move.trim()) return fail(c, 400, "invalid_move", "move must be a string in SAN (Nf3) or UCI (g1f3).");
  if (body.ply !== undefined && !(Number.isInteger(body.ply) && (body.ply as number) >= 0)) {
    return fail(c, 400, "invalid_ply", "ply must be the number of moves played before this one.");
  }
  const text = body.move;
  const ply = body.ply as number | undefined;
  const userId = c.get("user").id;
  try {
    return await serially(userId, async () => {
      let game = await openGame(pool, userId);
      if (!game) return fail(c, 404, "no_game", "There is no game in progress.");

      if (ply !== undefined && ply !== game.moves.length) {
        const before = ply < game.moves.length ? replay(game.moves.slice(0, ply)) : null;
        const same = before ? parseMove(before, text) : null;
        if (same && uciOf(same) === game.moves[ply]) return ok(c, view(await settled(userId, game)));
        return fail(c, 409, "stale_ply", `The game is at ply ${game.moves.length}, not ${ply}. Read it again.`, view(game));
      }

      const chess = replay(game.moves)!;
      if (chess.turn() !== game.player) {
        game = await settled(userId, game);
        return fail(c, 409, "not_your_turn", "It was the computer's turn; it has moved now. Read the game again.", view(game));
      }
      const move = parseMove(chess, text);
      if (!move) {
        const legal = chess.moves({ verbose: true }).map((m) => ({ san: m.san, uci: uciOf(m) }));
        return fail(c, 400, "illegal_move", `${text} is not a legal move here.`, { legalMoves: legal });
      }
      const moves = await withReply(game, [...game.moves, uciOf(move)]);
      const saved = await commit(userId, game, moves);
      if (!saved) {
        const now = await openGame(pool, userId);
        return fail(c, 409, "game_moved", "The game changed on another device. Read it again.", now ? view(now) : {});
      }
      return ok(c, view(saved));
    });
  } catch (error) {
    if (error instanceof EngineDown) return engineDown(c);
    throw error;
  }
});

/**
 * Gives up. Before both sides moved there is nothing to rate, so, as in the
 * app, the game is called off instead and leaves nothing behind.
 */
playRoutes.post("/game/resign", async (c) => {
  const userId = c.get("user").id;
  return serially(userId, async () => {
    const result = await transaction(async (client) => {
      const game = await openGame(client, userId, true);
      if (!game) return null;
      if (game.moves.length < RATED_AFTER) {
        await client.query("DELETE FROM games WHERE id = $1", [game.id]);
        return "cancelled" as const;
      }
      return finishGame(client, userId, game, game.moves, true, brazilDay());
    });
    if (!result) return fail(c, 404, "no_game", "There is no game in progress.");
    return ok(c, result === "cancelled" ? { status: "cancelled", game: null } : view(result));
  });
});

/** Calls the game off, only before both sides moved. */
playRoutes.delete("/game", async (c) => {
  const userId = c.get("user").id;
  return serially(userId, async () => {
    const game = await openGame(pool, userId);
    if (!game) return fail(c, 404, "no_game", "There is no game in progress.");
    const { rowCount } = await query("DELETE FROM games WHERE id = $1 AND finished_at IS NULL AND cardinality(moves) < $2", [game.id, RATED_AFTER]);
    if (!rowCount) return fail(c, 409, "cannot_cancel", "Both sides have moved, so the game counts now. Resign instead.", view(game));
    return ok(c, { status: "cancelled", game: null });
  });
});

playRoutes.all("*", (c) => fail(c, 404, "not_found", "No such endpoint."));
