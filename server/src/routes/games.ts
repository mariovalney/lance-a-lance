import { Hono } from "hono";
import { RATED_AFTER } from "../../../shared/scoring.js";
import { GAME_LEVELS, MAX_MOVES, UCI, continues, replay } from "../../../shared/games.js";
import { GAME_COLUMNS, gameJson, readProgress, type GameRow } from "../account.js";
import { pool, query, transaction } from "../db.js";
import { finishGame, openGame } from "../games.js";
import { requireUser, type Vars } from "./auth.js";
import { UUID, pageOf, playerDay } from "./util.js";
import { isPositionEval } from "../../../shared/analysis.js";

/**
 * Games against the computer. The engine runs in the browser; the app starts a
 * game here, saves its moves after each one, and finishes it. The server
 * replays the moves, reads the result off the final position (a resignation is
 * the only thing taken on trust), and scores it.
 */
export const gameRoutes = new Hono<Vars>();
gameRoutes.use("*", requireUser);

const isMoves = (v: unknown): v is string[] => Array.isArray(v) && v.length <= MAX_MOVES && v.every((m) => typeof m === "string" && UCI.test(m));

/** Legal UCI moves from the initial position, or null. */
function legalMoves(v: unknown): string[] | null {
  return isMoves(v) && replay(v) ? v : null;
}

gameRoutes.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { level?: unknown; player?: unknown; assisted?: unknown } | null;
  if (!body || !GAME_LEVELS.includes(body.level as never) || (body.player !== "w" && body.player !== "b") || typeof body.assisted !== "boolean") {
    return c.json({ error: "invalid_game" }, 400);
  }
  const userId = c.get("user").id;
  const { rows } = await query<GameRow>(
    `INSERT INTO games (user_id, level, player, assisted) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) WHERE finished_at IS NULL DO NOTHING
     RETURNING ${GAME_COLUMNS}`,
    [userId, body.level, body.player, body.assisted],
  );
  // A game is already open: it has to be finished or called off first.
  if (!rows[0]) return c.json({ error: "game_open" }, 409);
  return c.json({ progress: await readProgress(pool, userId), game: gameJson(rows[0]) }, 201);
});

/** A copy made before moves were taken back is stale; a client that sends no count is not checked. */
const sameUndos = (game: GameRow, undos: unknown) => undos === undefined || undos === game.undos;

/**
 * Saves the moves so far. They have to continue the saved ones: the same game
 * can move on another device or through the API, and then this copy is stale.
 * That is a 409 with the game as saved, for the app to pick it up.
 */
gameRoutes.put("/:id/moves", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { moves?: unknown; undos?: unknown } | null;
  const moves = legalMoves(body?.moves);
  if (!UUID.test(id) || !moves) return c.json({ error: "invalid_moves" }, 400);
  const userId = c.get("user").id;
  const result = await transaction(async (client) => {
    const game = await openGame(client, userId, true);
    if (game?.id !== id) return { status: 404 as const };
    if (!continues(game.moves, moves) || !sameUndos(game, body?.undos)) return { status: 409 as const, game };
    await client.query("UPDATE games SET moves = $2, updated_at = now() WHERE id = $1", [id, moves]);
    return { status: 200 as const };
  });
  if (result.status === 404) return c.json({ error: "not_found" }, 404);
  if (result.status === 409) return c.json({ error: "game_moved", game: gameJson(result.game) }, 409);
  return c.json({ ok: true });
});

gameRoutes.post("/:id/finish", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { moves?: unknown; resigned?: unknown; day?: unknown; undos?: unknown } | null;
  const moves = legalMoves(body?.moves);
  if (!UUID.test(id) || !moves || typeof body?.resigned !== "boolean") return c.json({ error: "invalid_finish" }, 400);
  const userId = c.get("user").id;
  const day = playerDay(body.day);

  const result = await transaction(async (client) => {
    const game = await openGame(client, userId, true);
    if (game?.id !== id) return { error: "not_found" as const };
    if (!continues(game.moves, moves) || !sameUndos(game, body.undos)) return { error: "game_moved" as const };
    const done = await finishGame(client, userId, game, moves, body.resigned as boolean, day);
    return done ? { game: gameJson(done) } : { error: "not_over" as const };
  });

  if ("error" in result) return c.json({ error: result.error }, result.error === "not_found" ? 404 : result.error === "game_moved" ? 409 : 400);
  return c.json({ progress: await readProgress(pool, userId), game: result.game });
});

/** Calls off a game before it counts (before both sides moved): it leaves nothing behind. */
gameRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
  const userId = c.get("user").id;
  const { rowCount } = await query(
    "DELETE FROM games WHERE id = $1 AND user_id = $2 AND finished_at IS NULL AND cardinality(moves) < $3",
    [id, userId, RATED_AFTER],
  );
  if (!rowCount) return c.json({ error: "not_found" }, 404);
  return c.json({ progress: await readProgress(pool, userId) });
});

/**
 * The open game, or null. The game screen asks every few seconds, so a move
 * made on another device or through the API shows up on its own.
 */
gameRoutes.get("/current", async (c) => {
  const game = await openGame(pool, c.get("user").id);
  return c.json({ game: game ? gameJson(game) : null });
});

/** Finished games, newest first; `assisted=true` or `false` keeps one kind only. */
gameRoutes.get("/", async (c) => {
  const paging = pageOf(c.req.query("page"), c.req.query("size"));
  if (!paging) return c.json({ error: "invalid_page" }, 400);
  const kind = c.req.query("assisted");
  if (kind !== undefined && kind !== "true" && kind !== "false") return c.json({ error: "invalid_filter" }, 400);
  const assisted = kind === undefined ? null : kind === "true";
  const userId = c.get("user").id;
  const [{ rows }, count] = await Promise.all([
    query<GameRow>(
      `SELECT ${GAME_COLUMNS} FROM games WHERE user_id = $1 AND finished_at IS NOT NULL AND ($4::boolean IS NULL OR assisted = $4)
        ORDER BY finished_at DESC, id LIMIT $2 OFFSET $3`,
      [userId, paging.size, paging.page * paging.size, assisted],
    ),
    query<{ total: string }>(
      "SELECT count(*) AS total FROM games WHERE user_id = $1 AND finished_at IS NOT NULL AND ($2::boolean IS NULL OR assisted = $2)",
      [userId, assisted],
    ),
  ]);
  return c.json({ total: Number(count.rows[0].total), items: rows.map(gameJson) });
});

/**
 * One finished game, for its review at `/partidas/<id>`. Somebody else's game,
 * a game that does not exist and an address that is not an id all get the same
 * 404, so the answer never says whether a game exists.
 */
gameRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
  const { rows } = await query<GameRow>(`SELECT ${GAME_COLUMNS} FROM games WHERE id = $1 AND user_id = $2 AND finished_at IS NOT NULL`, [
    id,
    c.get("user").id,
  ]);
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  return c.json({ game: gameJson(rows[0]) });
});

/**
 * Saves the engine's evaluation of every position of a finished game, which
 * the review computes in the browser. It scores nothing, so it is taken as
 * given once its shape is right: one entry per position, the initial one
 * included. Only the owner's game, with the same 404 as reading it.
 */
gameRoutes.put("/:id/analysis", async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "not_found" }, 404);
  const body = (await c.req.json().catch(() => null)) as { analysis?: unknown } | null;
  const analysis = body?.analysis;
  if (!Array.isArray(analysis) || analysis.length > MAX_MOVES + 1 || !analysis.every(isPositionEval)) {
    return c.json({ error: "invalid_analysis" }, 400);
  }
  const { rows } = await query<GameRow>(
    `UPDATE games SET analysis = $3::jsonb, updated_at = now()
      WHERE id = $1 AND user_id = $2 AND finished_at IS NOT NULL AND cardinality(moves) + 1 = $4
      RETURNING ${GAME_COLUMNS}`,
    [id, c.get("user").id, JSON.stringify(analysis), analysis.length],
  );
  if (rows[0]) return c.json({ game: gameJson(rows[0]) });
  // Either not this person's finished game, or the wrong number of positions.
  const { rowCount } = await query("SELECT 1 FROM games WHERE id = $1 AND user_id = $2 AND finished_at IS NOT NULL", [id, c.get("user").id]);
  return rowCount ? c.json({ error: "invalid_analysis" }, 400) : c.json({ error: "not_found" }, 404);
});
