/**
 * Points inside a lesson, which the lesson player adds up before reporting the
 * run. Everything that turns facts into XP, stars, streaks and ratings is in
 * `shared/scoring.ts`, applied by the server; the app uses it to show levels.
 */
export { PROVISIONAL_GAMES, START_RATING, levelProgress, pctOf, starsFor } from "@shared/scoring";

/** Points for a single-square exercise by attempt number (1-based). */
export function pointsForAttempt(attempt: number): number {
  if (attempt <= 1) return 10;
  if (attempt === 2) return 5;
  return 2;
}

/** Points for "find all squares" exercises: each wrong tap costs 3. */
export function pointsForWrongTaps(wrongTaps: number): number {
  return Math.max(10 - wrongTaps * 3, 2);
}

/** The local day (YYYY-MM-DD), which the server uses for the streak. */
export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
