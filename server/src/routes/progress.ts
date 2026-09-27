import { Hono } from "hono";
import type { LessonRunInput, LessonRunOutcome } from "../../../shared/types.js";
import { nextStreak, pctOf, starsFor, xpFor } from "../../../shared/scoring.js";
import { clearAccount, readProgress, statsOf } from "../account.js";
import { pool, transaction } from "../db.js";
import { requireUser, type Vars } from "./auth.js";
import { isInt, playerDay } from "./util.js";

/**
 * A person's progress. The app reads it whole and reports what happened; the
 * scoring happens here, in one transaction per fact.
 */
export const progressRoutes = new Hono<Vars>();
progressRoutes.use("*", requireUser);

progressRoutes.get("/", async (c) => c.json({ progress: await readProgress(pool, c.get("user").id) }));

/** Everything back to zero: stats, lessons, records, puzzles and games. */
progressRoutes.post("/reset", async (c) => {
  const userId = c.get("user").id;
  await transaction((client) => clearAccount(client, userId));
  return c.json({ progress: await readProgress(pool, userId) });
});

const LESSON_ID = /^m\d{1,2}-l\d{1,2}$/;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function parseRun(body: unknown): LessonRunInput | null {
  const b = body as Partial<LessonRunInput> | null;
  if (!b || typeof b.lessonId !== "string" || !LESSON_ID.test(b.lessonId)) return null;
  if (!isInt(b.maxPoints, 0, 1000) || !isInt(b.points, 0, b.maxPoints)) return null;
  if (!Array.isArray(b.mistakes) || b.mistakes.length > 100 || !b.mistakes.every((m) => isText(m, 300))) return null;
  const records = b.records ?? [];
  if (!Array.isArray(records) || records.length > 20 || !records.every((r) => isText(r?.key, 80) && isInt(r?.value, 0, 100_000))) return null;
  return { lessonId: b.lessonId, points: b.points, maxPoints: b.maxPoints, mistakes: b.mistakes, records, day: playerDay(b.day) };
}

/** A finished lesson run: XP, the lesson's best, the streak and the drill records. */
export const lessonRoutes = new Hono<Vars>();
lessonRoutes.use("*", requireUser);

lessonRoutes.post("/runs", async (c) => {
  const run = parseRun(await c.req.json().catch(() => null));
  if (!run) return c.json({ error: "invalid_run" }, 400);
  const userId = c.get("user").id;
  const pct = pctOf(run.points, run.maxPoints);
  const outcome: LessonRunOutcome = { xp: run.points, repeat: false, pct, stars: starsFor(pct) };

  await transaction(async (client) => {
    // Locks the player's row, so two runs of the same lesson cannot both count as the first.
    const stats = await statsOf(client, userId, true);
    const done = await client.query<{ completions: number }>("SELECT completions FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2", [
      userId,
      run.lessonId,
    ]);
    outcome.repeat = (done.rows[0]?.completions ?? 0) > 0;
    outcome.xp = xpFor(run.points, outcome.repeat);
    const streak = nextStreak({ current: stats.streak_current, best: stats.streak_best, lastDay: stats.streak_last_day }, run.day);
    await client.query(
      `UPDATE player_stats SET xp = xp + $2, streak_current = $3, streak_best = $4, streak_last_day = $5, updated_at = now()
        WHERE user_id = $1`,
      [userId, outcome.xp, streak.current, streak.best, streak.lastDay],
    );
    await client.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, best_stars, best_pct, completions, last_mistakes, first_completed_at, last_played_at)
       VALUES ($1, $2, $3, $4, 1, $5, now(), now())
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         best_stars = GREATEST(lesson_progress.best_stars, EXCLUDED.best_stars),
         best_pct = GREATEST(lesson_progress.best_pct, EXCLUDED.best_pct),
         completions = lesson_progress.completions + 1,
         last_mistakes = EXCLUDED.last_mistakes,
         first_completed_at = COALESCE(lesson_progress.first_completed_at, EXCLUDED.first_completed_at),
         last_played_at = now()`,
      [userId, run.lessonId, outcome.stars, outcome.pct, run.mistakes.slice(0, 20)],
    );
    await client.query("INSERT INTO lesson_runs (user_id, lesson_id, pct, stars, xp, mistakes) VALUES ($1, $2, $3, $4, $5, $6)", [
      userId,
      run.lessonId,
      outcome.pct,
      outcome.stars,
      outcome.xp,
      run.mistakes.length,
    ]);
    for (const r of run.records) {
      await client.query(
        `INSERT INTO drill_records (user_id, key, value) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = GREATEST(drill_records.value, EXCLUDED.value),
           updated_at = CASE WHEN EXCLUDED.value > drill_records.value THEN now() ELSE drill_records.updated_at END`,
        [userId, r.key, r.value],
      );
    }
  });
  return c.json({ progress: await readProgress(pool, userId), run: outcome });
});
