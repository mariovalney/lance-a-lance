import type { LessonRunResult, ProgressState, Stars } from "@/lib/progress/types";

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

export function starsFor(pct: number): Stars {
  if (pct >= 90) return 3;
  if (pct >= 70) return 2;
  return 1;
}

export function pctOf(result: Pick<LessonRunResult, "points" | "maxPoints">): number {
  if (result.maxPoints === 0) return 100;
  return Math.round((result.points / result.maxPoints) * 100);
}

/* Levels: level n starts at 50 * n * (n - 1) XP (0, 100, 300, 600, 1000...). */
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

export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function previousDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d - 1));
}

/** Streak shown today: it stays alive through yesterday. */
export function visibleStreak(state: ProgressState, today = localDay()): number {
  const { lastDay, current } = state.streak;
  if (!lastDay) return 0;
  if (lastDay === today || lastDay === previousDay(today)) return current;
  return 0;
}

export function applyRun(state: ProgressState, run: LessonRunResult, now = new Date()): ProgressState {
  const pct = pctOf(run);
  const stars = starsFor(pct);
  const today = localDay(now);
  const iso = now.toISOString();
  const prev = state.lessons[run.lessonId];

  let { current, best, lastDay } = state.streak;
  if (lastDay !== today) {
    current = lastDay === previousDay(today) ? current + 1 : 1;
    lastDay = today;
  }
  best = Math.max(best, current);

  return {
    ...state,
    xp: state.xp + run.points,
    lessons: {
      ...state.lessons,
      [run.lessonId]: {
        bestStars: Math.max(prev?.bestStars ?? 0, stars) as Stars,
        bestPct: Math.max(prev?.bestPct ?? 0, pct),
        completions: (prev?.completions ?? 0) + 1,
        firstCompletedAt: prev?.firstCompletedAt ?? iso,
        lastPlayedAt: iso,
        lastMistakes: run.mistakes.slice(0, 20),
      },
    },
    streak: { current, best, lastDay },
    records: mergeRecords(state.records ?? {}, run),
    history: [
      {
        lessonId: run.lessonId,
        at: iso,
        pct,
        stars,
        xp: run.points,
        mistakes: run.mistakes.length,
      },
      ...state.history,
    ].slice(0, 60),
    updatedAt: now.getTime(),
  };
}

function mergeRecords(prev: Record<string, number>, run: LessonRunResult): Record<string, number> {
  const next = { ...prev };
  for (const r of run.records ?? []) next[r.key] = Math.max(next[r.key] ?? 0, r.value);
  return next;
}

/* ---------- puzzle rating (simple Elo) ---------- */

export const START_RATING = 800;
export const PROVISIONAL_GAMES = 10;

export function emptyPuzzleStats(): import("@/lib/progress/types").PuzzleStats {
  return { rating: START_RATING, played: 0, solved: 0, streak: 0, bestStreak: 0, recent: [] };
}

/** Rating change for solving (ok) or failing a puzzle of `puzzleRating`. */
export function eloDelta(rating: number, puzzleRating: number, played: number, ok: boolean): number {
  const expected = 1 / (1 + Math.pow(10, (puzzleRating - rating) / 400));
  const k = played < PROVISIONAL_GAMES ? 40 : 20;
  return Math.round(k * ((ok ? 1 : 0) - expected));
}

export function applyPuzzle(state: ProgressState, r: import("@/lib/progress/types").PuzzleResult, now = new Date()): ProgressState {
  const ps = state.puzzles ?? emptyPuzzleStats();
  const ok = r.status === "ok";
  const delta = eloDelta(ps.rating, r.puzzleRating, ps.played, ok);
  const rating = Math.max(100, ps.rating + delta);
  const streakNow = ok ? ps.streak + 1 : 0;
  const today = localDay(now);
  let { current, best, lastDay } = state.streak;
  if (lastDay !== today) {
    current = lastDay === previousDay(today) ? current + 1 : 1;
    lastDay = today;
  }
  best = Math.max(best, current);
  return {
    ...state,
    xp: state.xp + r.points,
    streak: { current, best, lastDay },
    puzzles: {
      rating,
      played: ps.played + 1,
      solved: ps.solved + (ok ? 1 : 0),
      streak: streakNow,
      bestStreak: Math.max(ps.bestStreak, streakNow),
      recent: [r.id, ...ps.recent.filter((x) => x !== r.id)].slice(0, 400),
    },
    updatedAt: now.getTime(),
  };
}
