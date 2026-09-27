import { Hono } from "hono";
import type { PuzzleStatus } from "../../../shared/types.js";
import { PUZZLE_XP, eloScoreDelta, nextStreak, ratingAfter } from "../../../shared/scoring.js";
import { puzzleRating } from "../../../shared/puzzles.js";
import { ATTEMPT_COLUMNS, attemptJson, readProgress, statsOf, type AttemptRow } from "../account.js";
import { pool, query, transaction } from "../db.js";
import { requireUser, type Vars } from "./auth.js";
import { pageOf, playerDay } from "./util.js";

/** The puzzle trainer: rated attempts and their history. */
export const puzzleRoutes = new Hono<Vars>();
puzzleRoutes.use("*", requireUser);

const STATUSES = new Set<PuzzleStatus>(["ok", "erro", "solucao"]);

puzzleRoutes.post("/attempts", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { puzzleId?: unknown; status?: unknown; day?: unknown } | null;
  const status = body?.status as PuzzleStatus;
  // The puzzle's rating comes from the trainer's data, never from the request.
  const rated = typeof body?.puzzleId === "string" ? puzzleRating(body.puzzleId) : undefined;
  if (!body || rated === undefined || !STATUSES.has(status)) return c.json({ error: "invalid_attempt" }, 400);
  const puzzleId = body.puzzleId as string;
  const userId = c.get("user").id;
  const day = playerDay(body.day);
  const solved = status === "ok";

  const attempt = await transaction(async (client) => {
    const stats = await statsOf(client, userId, true);
    const delta = eloScoreDelta(stats.puzzle_rating, rated, stats.puzzle_played, solved ? 1 : 0);
    const after = ratingAfter(stats.puzzle_rating, delta);
    const xp = PUZZLE_XP[status];
    const streak = nextStreak({ current: stats.streak_current, best: stats.streak_best, lastDay: stats.streak_last_day }, day);
    const run = solved ? stats.puzzle_streak + 1 : 0;
    await client.query(
      `UPDATE player_stats SET xp = xp + $2, streak_current = $3, streak_best = $4, streak_last_day = $5,
         puzzle_rating = $6, puzzle_played = puzzle_played + 1, puzzle_solved = puzzle_solved + $7,
         puzzle_streak = $8, puzzle_best_streak = GREATEST(puzzle_best_streak, $8), updated_at = now()
        WHERE user_id = $1`,
      [userId, xp, streak.current, streak.best, streak.lastDay, after, solved ? 1 : 0, run],
    );
    const { rows } = await client.query<AttemptRow>(
      `INSERT INTO puzzle_attempts (user_id, puzzle_id, status, puzzle_rating, rating_delta, rating_after, xp)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${ATTEMPT_COLUMNS}`,
      [userId, puzzleId, status, rated, after - stats.puzzle_rating, after, xp],
    );
    return attemptJson(rows[0]);
  });
  return c.json({ progress: await readProgress(pool, userId), attempt });
});

/** Attempts, newest first. */
puzzleRoutes.get("/attempts", async (c) => {
  const paging = pageOf(c.req.query("page"), c.req.query("size"));
  if (!paging) return c.json({ error: "invalid_page" }, 400);
  const userId = c.get("user").id;
  const [{ rows }, count] = await Promise.all([
    query<AttemptRow>(`SELECT ${ATTEMPT_COLUMNS} FROM puzzle_attempts WHERE user_id = $1 ORDER BY attempted_at DESC, id DESC LIMIT $2 OFFSET $3`, [
      userId,
      paging.size,
      paging.page * paging.size,
    ]),
    query<{ total: string }>("SELECT count(*) AS total FROM puzzle_attempts WHERE user_id = $1", [userId]),
  ]);
  return c.json({ total: Number(count.rows[0].total), items: rows.map(attemptJson) });
});
