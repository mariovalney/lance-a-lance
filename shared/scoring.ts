/**
 * The scoring rules, shared by the server (which applies them) and the app
 * (which shows levels and previews). Pure functions only: no DOM, no Node.
 */
import type { GameOutcome, PuzzleStatus, Stars, Streak } from "./types.js";

/* ---------- lessons ---------- */

export function pctOf(points: number, maxPoints: number): number {
  if (maxPoints <= 0) return 100;
  return Math.round((points / maxPoints) * 100);
}

/**
 * The XP a lesson run earns. Played again after it was completed, a lesson
 * earns half, so a level says how far someone came rather than how often the
 * easiest lesson was replayed. Stars and percentages still use the full points.
 */
export function xpFor(points: number, repeat: boolean): number {
  return repeat ? Math.round(points / 2) : points;
}

export function starsFor(pct: number): Stars {
  if (pct >= 90) return 3;
  if (pct >= 70) return 2;
  return 1;
}

/* ---------- levels: level n starts at 50 * n * (n - 1) XP (0, 100, 300, 600...) ---------- */

export function levelStart(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xp >= levelStart(level + 1)) level++;
  return level;
}

export function levelTitle(level: number): string {
  if (level <= 2) return "Peão";
  if (level <= 4) return "Cavalo";
  if (level <= 6) return "Bispo";
  if (level <= 8) return "Torre";
  if (level <= 10) return "Dama";
  return "Rei";
}

export function levelProgress(xp: number) {
  const level = levelFromXp(xp);
  const start = levelStart(level);
  const next = levelStart(level + 1);
  return {
    level,
    title: levelTitle(level),
    intoLevel: xp - start,
    levelSize: next - start,
    toNext: next - xp,
    pct: Math.round(((xp - start) / (next - start)) * 100),
  };
}

/* ---------- the day streak, by the player's local day (YYYY-MM-DD) ---------- */

export const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The day before a YYYY-MM-DD day, computed on the calendar, not a clock. */
export function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/** The streak after some activity on `day`: same day keeps it, the next day grows it, a gap restarts it. */
export function nextStreak(streak: Streak, day: string): Streak {
  if (streak.lastDay === day) return streak;
  const current = streak.lastDay === previousDay(day) ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastDay: day };
}

/* ---------- ratings: a simple Elo, shared by puzzles and games ---------- */

export const START_RATING = 800;
export const RATING_FLOOR = 100;
/** The first games or puzzles move the rating faster. */
export const PROVISIONAL_GAMES = 10;

/** Rating change for a score of 1 (win), 0.5 (draw) or 0 (loss) against `opponent`. */
export function eloScoreDelta(rating: number, opponent: number, played: number, score: number): number {
  const expected = 1 / (1 + Math.pow(10, (opponent - rating) / 400));
  const k = played < PROVISIONAL_GAMES ? 40 : 20;
  return Math.round(k * (score - expected));
}

/** The rating after a change, never below the floor. */
export function ratingAfter(rating: number, delta: number): number {
  return Math.max(RATING_FLOOR, rating + delta);
}

/* ---------- puzzles ---------- */

/** Only a clean solve counts as a win. */
export const PUZZLE_XP: Record<PuzzleStatus, number> = { ok: 10, erro: 3, solucao: 0 };

/** How many recently seen puzzles the picker avoids. */
export const RECENT_PUZZLES = 400;

/* ---------- games ---------- */

export const GAME_SCORE: Record<GameOutcome, number> = { win: 1, draw: 0.5, loss: 0 };
export const GAME_XP: Record<GameOutcome, number> = { win: 10, draw: 5, loss: 2 };

/** A game is rated once both sides have moved, as on Lichess, and never when assisted. */
export const RATED_AFTER = 2;

export function isRatedGame(assisted: boolean, moveCount: number): boolean {
  return !assisted && moveCount >= RATED_AFTER;
}
