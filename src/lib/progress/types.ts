export type Stars = 0 | 1 | 2 | 3;

export interface LessonProgress {
  bestStars: Stars;
  bestPct: number;
  completions: number;
  firstCompletedAt?: string;
  lastPlayedAt?: string;
  /** Mistakes from the most recent run (plain text, for review). */
  lastMistakes?: string[];
}

export interface HistoryEntry {
  lessonId: string;
  at: string;
  pct: number;
  stars: Stars;
  xp: number;
  mistakes: number;
}

export interface ProgressState {
  version: 1;
  xp: number;
  lessons: Record<string, LessonProgress>;
  streak: { current: number; best: number; lastDay: string | null };
  history: HistoryEntry[];
  /** Personal records for timed drills, by drill key. */
  records?: Record<string, number>;
  /** Puzzle trainer stats and rating. */
  puzzles?: PuzzleStats;
  updatedAt: number;
}

export interface PuzzleStats {
  rating: number;
  played: number;
  solved: number;
  streak: number;
  bestStreak: number;
  /** Recently seen puzzle ids (newest first), to avoid repeats. */
  recent: string[];
  /** Legacy: the full history now lives in the puzzle log (chunked documents). */
  history?: unknown[];
}

/** ok = solved clean, erro = solved after a mistake, solucao = asked for the solution. */
export type PuzzleStatus = "ok" | "erro" | "solucao";

export interface PuzzleResult {
  id: string;
  status: PuzzleStatus;
  puzzleRating: number;
  points: number;
}

/** One line of the puzzle history. */
export interface PuzzleLogEntry {
  /** Lichess puzzle id */
  i: string;
  s: PuzzleStatus;
  /** Rating change */
  d: number;
  /** Rating after */
  r: number;
  /** Puzzle rating */
  p: number;
  /** Timestamp (ms) */
  t: number;
}

export interface RecordEntry {
  key: string;
  value: number;
  label: string;
}

/** Outcome of one lesson run, produced by the lesson player. */
export interface LessonRunResult {
  lessonId: string;
  points: number;
  maxPoints: number;
  exercises: number;
  firstTry: number;
  mistakes: string[];
  records?: RecordEntry[];
}

export function emptyProgress(): ProgressState {
  return {
    version: 1,
    xp: 0,
    lessons: {},
    streak: { current: 0, best: 0, lastDay: null },
    history: [],
    updatedAt: 0,
  };
}
