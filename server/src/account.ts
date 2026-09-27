import type { AccountData, Game, GameEndReason, GameOutcome, LessonStats, ProgressView, PuzzleAttempt, Stars } from "../../shared/types.js";
import { RECENT_PUZZLES, START_RATING } from "../../shared/scoring.js";
import type { Db } from "./db.js";

/**
 * A person's progress as rows: reading it as the app's read model, reading and
 * writing all of it for the backup, and the row shapes shared by the routes.
 */

export interface StatsRow {
  xp: number;
  streak_current: number;
  streak_best: number;
  streak_last_day: string | null;
  puzzle_rating: number;
  puzzle_played: number;
  puzzle_solved: number;
  puzzle_streak: number;
  puzzle_best_streak: number;
  game_rating: number;
  game_played: number;
  game_wins: number;
  game_draws: number;
  game_losses: number;
}

const STATS_COLUMNS =
  "xp, streak_current, streak_best, to_char(streak_last_day, 'YYYY-MM-DD') AS streak_last_day, puzzle_rating, puzzle_played, puzzle_solved, puzzle_streak, puzzle_best_streak, game_rating, game_played, game_wins, game_draws, game_losses";

/** The totals row, created on first use and locked for the transaction when `forUpdate`. */
export async function statsOf(db: Db, userId: string, forUpdate = false): Promise<StatsRow> {
  await db.query("INSERT INTO player_stats (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [userId]);
  const { rows } = await db.query<StatsRow>(`SELECT ${STATS_COLUMNS} FROM player_stats WHERE user_id = $1${forUpdate ? " FOR UPDATE" : ""}`, [userId]);
  return rows[0];
}

export interface GameRow {
  id: string;
  level: number;
  player: "w" | "b";
  assisted: boolean;
  moves: string[];
  outcome: GameOutcome | null;
  reason: GameEndReason | null;
  rating_delta: number | null;
  rating_after: number | null;
  xp: number;
  started_at: Date;
  finished_at: Date | null;
}

export const GAME_COLUMNS = "id, level, player, assisted, moves, outcome, reason, rating_delta, rating_after, xp, started_at, finished_at";

export function gameJson(row: GameRow): Game {
  return {
    id: row.id,
    level: row.level,
    player: row.player,
    assisted: row.assisted,
    moves: row.moves,
    outcome: row.outcome,
    reason: row.reason,
    ratingDelta: row.rating_delta,
    ratingAfter: row.rating_after,
    xp: row.xp,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}

export interface AttemptRow {
  id: string;
  puzzle_id: string;
  status: "ok" | "erro" | "solucao";
  puzzle_rating: number;
  rating_delta: number;
  rating_after: number;
  xp: number;
  attempted_at: Date;
}

export const ATTEMPT_COLUMNS = "id, puzzle_id, status, puzzle_rating, rating_delta, rating_after, xp, attempted_at";

export function attemptJson(row: AttemptRow): PuzzleAttempt {
  return {
    id: Number(row.id),
    puzzleId: row.puzzle_id,
    status: row.status,
    puzzleRating: row.puzzle_rating,
    ratingDelta: row.rating_delta,
    ratingAfter: row.rating_after,
    xp: row.xp,
    at: row.attempted_at.toISOString(),
  };
}

/** Everything the app shows. */
export async function readProgress(db: Db, userId: string): Promise<ProgressView> {
  const stats = await statsOf(db, userId);
  const [lessons, records, recent, current] = await Promise.all([
    db.query<{ lesson_id: string; best_stars: number; best_pct: number; completions: number; last_mistakes: string[] }>(
      "SELECT lesson_id, best_stars, best_pct, completions, last_mistakes FROM lesson_progress WHERE user_id = $1",
      [userId],
    ),
    db.query<{ key: string; value: number }>("SELECT key, value FROM drill_records WHERE user_id = $1", [userId]),
    // The ids most recently seen, each once, newest first.
    db.query<{ puzzle_id: string }>(
      `SELECT puzzle_id FROM (
         SELECT puzzle_id, max(id) AS last FROM (
           SELECT id, puzzle_id FROM puzzle_attempts WHERE user_id = $1 ORDER BY id DESC LIMIT $2
         ) latest GROUP BY puzzle_id
       ) seen ORDER BY last DESC`,
      [userId, RECENT_PUZZLES],
    ),
    db.query<GameRow>(`SELECT ${GAME_COLUMNS} FROM games WHERE user_id = $1 AND finished_at IS NULL`, [userId]),
  ]);
  return {
    xp: stats.xp,
    streak: { current: stats.streak_current, best: stats.streak_best, lastDay: stats.streak_last_day },
    lessons: Object.fromEntries(
      lessons.rows.map((l): [string, LessonStats] => [
        l.lesson_id,
        { bestStars: l.best_stars as Stars, bestPct: l.best_pct, completions: l.completions, lastMistakes: l.last_mistakes },
      ]),
    ),
    records: Object.fromEntries(records.rows.map((r) => [r.key, r.value])),
    puzzles: {
      rating: stats.puzzle_rating,
      played: stats.puzzle_played,
      solved: stats.puzzle_solved,
      streak: stats.puzzle_streak,
      bestStreak: stats.puzzle_best_streak,
      recent: recent.rows.map((r) => r.puzzle_id),
    },
    games: {
      rating: stats.game_rating,
      played: stats.game_played,
      wins: stats.game_wins,
      draws: stats.game_draws,
      losses: stats.game_losses,
      current: current.rows[0] ? gameJson(current.rows[0]) : null,
    },
  };
}

/** A person's whole progress, for the backup. The open game is left out. */
export async function readAccount(db: Db, userId: string): Promise<AccountData> {
  const stats = await statsOf(db, userId);
  const [lessons, runs, records, attempts, games] = await Promise.all([
    db.query<{
      lesson_id: string;
      best_stars: number;
      best_pct: number;
      completions: number;
      last_mistakes: string[];
      first_completed_at: Date | null;
      last_played_at: Date | null;
    }>("SELECT lesson_id, best_stars, best_pct, completions, last_mistakes, first_completed_at, last_played_at FROM lesson_progress WHERE user_id = $1 ORDER BY lesson_id", [
      userId,
    ]),
    db.query<{ lesson_id: string; pct: number; stars: number; xp: number; mistakes: number; played_at: Date }>(
      "SELECT lesson_id, pct, stars, xp, mistakes, played_at FROM lesson_runs WHERE user_id = $1 ORDER BY played_at, id",
      [userId],
    ),
    db.query<{ key: string; value: number }>("SELECT key, value FROM drill_records WHERE user_id = $1 ORDER BY key", [userId]),
    db.query<AttemptRow>(`SELECT ${ATTEMPT_COLUMNS} FROM puzzle_attempts WHERE user_id = $1 ORDER BY attempted_at, id`, [userId]),
    db.query<GameRow>(`SELECT ${GAME_COLUMNS} FROM games WHERE user_id = $1 AND finished_at IS NOT NULL ORDER BY finished_at, id`, [userId]),
  ]);
  return {
    stats: {
      xp: stats.xp,
      streak: { current: stats.streak_current, best: stats.streak_best, lastDay: stats.streak_last_day },
      puzzles: {
        rating: stats.puzzle_rating,
        played: stats.puzzle_played,
        solved: stats.puzzle_solved,
        streak: stats.puzzle_streak,
        bestStreak: stats.puzzle_best_streak,
      },
      games: { rating: stats.game_rating, played: stats.game_played, wins: stats.game_wins, draws: stats.game_draws, losses: stats.game_losses },
    },
    lessons: lessons.rows.map((l) => ({
      lessonId: l.lesson_id,
      bestStars: l.best_stars as Stars,
      bestPct: l.best_pct,
      completions: l.completions,
      lastMistakes: l.last_mistakes,
      firstCompletedAt: l.first_completed_at?.toISOString() ?? null,
      lastPlayedAt: l.last_played_at?.toISOString() ?? null,
    })),
    lessonRuns: runs.rows.map((r) => ({ lessonId: r.lesson_id, pct: r.pct, stars: r.stars as Stars, xp: r.xp, mistakes: r.mistakes, at: r.played_at.toISOString() })),
    records: records.rows,
    puzzleAttempts: attempts.rows.map((a) => {
      const { id: _id, ...rest } = attemptJson(a);
      return rest;
    }),
    games: games.rows.map(gameJson),
  };
}

/** Deletes a person's progress, open game included. */
export async function clearAccount(db: Db, userId: string): Promise<void> {
  for (const table of ["games", "puzzle_attempts", "drill_records", "lesson_runs", "lesson_progress", "player_stats"]) {
    await db.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
  }
}

/**
 * Replaces a person's progress with `data`. Run it inside a transaction: it
 * clears first, so on its own a failure halfway would leave half a person.
 */
export async function writeAccount(db: Db, userId: string, data: AccountData): Promise<void> {
  await clearAccount(db, userId);
  const { stats } = data;
  await db.query(
    `INSERT INTO player_stats (user_id, xp, streak_current, streak_best, streak_last_day, puzzle_rating, puzzle_played, puzzle_solved,
       puzzle_streak, puzzle_best_streak, game_rating, game_played, game_wins, game_draws, game_losses)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      userId,
      stats.xp,
      stats.streak.current,
      stats.streak.best,
      stats.streak.lastDay,
      stats.puzzles.rating,
      stats.puzzles.played,
      stats.puzzles.solved,
      stats.puzzles.streak,
      stats.puzzles.bestStreak,
      stats.games.rating,
      stats.games.played,
      stats.games.wins,
      stats.games.draws,
      stats.games.losses,
    ],
  );
  for (const l of data.lessons) {
    await db.query(
      `INSERT INTO lesson_progress (user_id, lesson_id, best_stars, best_pct, completions, last_mistakes, first_completed_at, last_played_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, l.lessonId, l.bestStars, l.bestPct, l.completions, l.lastMistakes, l.firstCompletedAt, l.lastPlayedAt],
    );
  }
  if (data.lessonRuns.length) {
    const r = data.lessonRuns;
    await db.query(
      `INSERT INTO lesson_runs (user_id, lesson_id, pct, stars, xp, mistakes, played_at)
       SELECT $1, * FROM unnest($2::text[], $3::smallint[], $4::smallint[], $5::int[], $6::int[], $7::timestamptz[])`,
      [userId, r.map((x) => x.lessonId), r.map((x) => x.pct), r.map((x) => x.stars), r.map((x) => x.xp), r.map((x) => x.mistakes), r.map((x) => x.at)],
    );
  }
  for (const rec of data.records) {
    await db.query("INSERT INTO drill_records (user_id, key, value) VALUES ($1, $2, $3)", [userId, rec.key, rec.value]);
  }
  if (data.puzzleAttempts.length) {
    const a = data.puzzleAttempts;
    await db.query(
      `INSERT INTO puzzle_attempts (user_id, puzzle_id, status, puzzle_rating, rating_delta, rating_after, xp, attempted_at)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::int[], $5::int[], $6::int[], $7::int[], $8::timestamptz[])`,
      [
        userId,
        a.map((x) => x.puzzleId),
        a.map((x) => x.status),
        a.map((x) => x.puzzleRating),
        a.map((x) => x.ratingDelta),
        a.map((x) => x.ratingAfter),
        a.map((x) => x.xp),
        a.map((x) => x.at),
      ],
    );
  }
  for (const g of data.games) {
    await db.query(
      `INSERT INTO games (id, user_id, level, player, assisted, moves, outcome, reason, rating_delta, rating_after, xp, started_at, updated_at, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
       ON CONFLICT (id) DO NOTHING`,
      [g.id, userId, g.level, g.player, g.assisted, g.moves, g.outcome, g.reason, g.ratingDelta, g.ratingAfter, g.xp, g.startedAt, g.finishedAt],
    );
  }
  await recountGames(db, userId);
}

/**
 * Sets the game counters and the game rating from the rated games that are
 * saved, for one person or, with null, for everybody. A backup can carry totals
 * with no games behind them (version 1 kept only totals), and the card must
 * never count a game the history cannot show.
 */
export async function recountGames(db: Db, userId: string | null): Promise<void> {
  await db.query(
    `UPDATE player_stats s SET
       game_played = r.played, game_wins = r.wins, game_draws = r.draws, game_losses = r.losses,
       game_rating = COALESCE(r.rating, $2)
     FROM (
       SELECT u.user_id,
         count(g.id)::int AS played,
         count(g.id) FILTER (WHERE g.outcome = 'win')::int AS wins,
         count(g.id) FILTER (WHERE g.outcome = 'draw')::int AS draws,
         count(g.id) FILTER (WHERE g.outcome = 'loss')::int AS losses,
         (array_agg(g.rating_after ORDER BY g.finished_at DESC, g.id DESC) FILTER (WHERE g.id IS NOT NULL))[1] AS rating
       FROM player_stats u
       LEFT JOIN games g ON g.user_id = u.user_id AND g.finished_at IS NOT NULL AND g.rating_delta IS NOT NULL
       WHERE $1::uuid IS NULL OR u.user_id = $1
       GROUP BY u.user_id
     ) r
     WHERE s.user_id = r.user_id`,
    [userId, START_RATING],
  );
}

export const EMPTY_STATS: AccountData["stats"] = {
  xp: 0,
  streak: { current: 0, best: 0, lastDay: null },
  puzzles: { rating: START_RATING, played: 0, solved: 0, streak: 0, bestStreak: 0 },
  games: { rating: START_RATING, played: 0, wins: 0, draws: 0, losses: 0 },
};
