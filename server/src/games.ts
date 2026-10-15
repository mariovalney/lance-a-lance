import type pg from "pg";
import type { GameEndReason, GameOutcome } from "../../shared/types.js";
import { GAME_SCORE, GAME_XP, eloScoreDelta, isRatedGame, nextStreak, ratingAfter } from "../../shared/scoring.js";
import { endOf, replay } from "../../shared/games.js";
import { GAME_COLUMNS, statsOf, type GameRow } from "./account.js";
import type { Db } from "./db.js";

/**
 * What the app's game routes and the API's share: reading the open game and
 * ending it.
 */

/** The person's open game, locked for the transaction when `forUpdate`. */
export async function openGame(db: Db, userId: string, forUpdate = false): Promise<GameRow | null> {
  const { rows } = await db.query<GameRow>(`SELECT ${GAME_COLUMNS} FROM games WHERE user_id = $1 AND finished_at IS NULL${forUpdate ? " FOR UPDATE" : ""}`, [
    userId,
  ]);
  return rows[0] ?? null;
}

/**
 * Ends an open game, locked by the caller, after these moves. The result is
 * read off the final position; `resigned` only counts while the rules have not
 * ended it. Rated games move the rating, the counts, the XP and the day streak.
 */
export async function finishGame(
  client: pg.PoolClient,
  userId: string,
  game: GameRow,
  moves: string[],
  resigned: boolean,
  day: string,
): Promise<GameRow | null> {
  const end = endOf(replay(moves)!, game.player);
  let outcome: GameOutcome;
  let reason: GameEndReason;
  if (end) ({ outcome, reason } = end);
  else if (resigned) [outcome, reason] = ["loss", "resigned"];
  else return null;

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
    [game.id, moves, outcome, reason, delta, after, xp],
  );
  return updated.rows[0];
}
