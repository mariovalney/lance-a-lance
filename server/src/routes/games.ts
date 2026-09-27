import { Hono } from "hono";
import type { GameEndReason, GameOutcome } from "../../../shared/types.js";
import { GAME_SCORE, GAME_XP, RATED_AFTER, eloScoreDelta, isRatedGame, nextStreak, ratingAfter } from "../../../shared/scoring.js";
import { GAME_LEVELS, MAX_MOVES, UCI, endOf, replay } from "../../../shared/games.js";
import { GAME_COLUMNS, gameJson, readProgress, statsOf, type GameRow } from "../account.js";
import { pool, query, transaction } from "../db.js";
import { requireUser, type Vars } from "./auth.js";
import { UUID, pageOf, playerDay } from "./util.js";

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

gameRoutes.put("/:id/moves", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { moves?: unknown } | null;
  const moves = legalMoves(body?.moves);
  if (!UUID.test(id) || !moves) return c.json({ error: "invalid_moves" }, 400);
  const { rowCount } = await query("UPDATE games SET moves = $3, updated_at = now() WHERE id = $1 AND user_id = $2 AND finished_at IS NULL", [
    id,
    c.get("user").id,
    moves,
  ]);
  return rowCount ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
});

gameRoutes.post("/:id/finish", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as { moves?: unknown; resigned?: unknown; day?: unknown } | null;
  const moves = legalMoves(body?.moves);
  if (!UUID.test(id) || !moves || typeof body?.resigned !== "boolean") return c.json({ error: "invalid_finish" }, 400);
  const userId = c.get("user").id;
  const day = playerDay(body.day);

  const result = await transaction(async (client) => {
    const { rows } = await client.query<GameRow>(`SELECT ${GAME_COLUMNS} FROM games WHERE id = $1 AND user_id = $2 AND finished_at IS NULL FOR UPDATE`, [
      id,
      userId,
    ]);
    const game = rows[0];
    if (!game) return { error: "not_found" as const };

    const end = endOf(replay(moves)!, game.player);
    let outcome: GameOutcome;
    let reason: GameEndReason;
    if (end) ({ outcome, reason } = end);
    else if (body.resigned) [outcome, reason] = ["loss", "resigned"];
    else return { error: "not_over" as const };

    const stats = await statsOf(client, userId, true);
    const rated = isRatedGame(game.assisted, moves.length);
    let delta: number | null = null;
    let after: number | null = null;
    let xp = 0;
    if (rated) {
      delta = eloScoreDelta(stats.game_rating, game.level, stats.game_played, GAME_SCORE[outcome]);
      after = ratingAfter(stats.game_rating, delta);
      delta = after - stats.game_rating;
      xp = GAME_XP[outcome];
      const streak = nextStreak({ current: stats.streak_current, best: stats.streak_best, lastDay: stats.streak_last_day }, day);
      await client.query(
        `UPDATE player_stats SET xp = xp + $2, streak_current = $3, streak_best = $4, streak_last_day = $5,
           game_rating = $6, game_played = game_played + 1, game_wins = game_wins + $7, game_draws = game_draws + $8,
           game_losses = game_losses + $9, updated_at = now()
          WHERE user_id = $1`,
        [userId, xp, streak.current, streak.best, streak.lastDay, after, +(outcome === "win"), +(outcome === "draw"), +(outcome === "loss")],
      );
    }
    const updated = await client.query<GameRow>(
      `UPDATE games SET moves = $2, outcome = $3, reason = $4, rating_delta = $5, rating_after = $6, xp = $7,
         updated_at = now(), finished_at = now()
        WHERE id = $1 RETURNING ${GAME_COLUMNS}`,
      [id, moves, outcome, reason, delta, after, xp],
    );
    return { game: gameJson(updated.rows[0]) };
  });

  if ("error" in result) return c.json({ error: result.error }, result.error === "not_found" ? 404 : 400);
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

/** Finished games, newest first. */
gameRoutes.get("/", async (c) => {
  const paging = pageOf(c.req.query("page"), c.req.query("size"));
  if (!paging) return c.json({ error: "invalid_page" }, 400);
  const userId = c.get("user").id;
  const [{ rows }, count] = await Promise.all([
    query<GameRow>(
      `SELECT ${GAME_COLUMNS} FROM games WHERE user_id = $1 AND finished_at IS NOT NULL
        ORDER BY finished_at DESC, id LIMIT $2 OFFSET $3`,
      [userId, paging.size, paging.page * paging.size],
    ),
    query<{ total: string }>("SELECT count(*) AS total FROM games WHERE user_id = $1 AND finished_at IS NOT NULL", [userId]),
  ]);
  return c.json({ total: Number(count.rows[0].total), items: rows.map(gameJson) });
});
