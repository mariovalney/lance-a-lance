/**
 * What the app and the server say to each other: the read model the app shows,
 * the facts it reports, and the backup file. The server is the one that scores.
 */

export type Stars = 0 | 1 | 2 | 3;

export interface Streak {
  current: number;
  best: number;
  /** The player's local day (YYYY-MM-DD) of the last activity. */
  lastDay: string | null;
}

export interface LessonStats {
  bestStars: Stars;
  bestPct: number;
  completions: number;
  /** Mistakes from the most recent run, for review. */
  lastMistakes: string[];
}

/** ok = solved clean, erro = solved after a mistake, solucao = asked for the solution. */
export type PuzzleStatus = "ok" | "erro" | "solucao";

export interface PuzzleStats {
  rating: number;
  played: number;
  solved: number;
  streak: number;
  bestStreak: number;
  /** Recently seen puzzle ids, newest first, for the picker to avoid. */
  recent: string[];
}

export type GameOutcome = "win" | "draw" | "loss";

/** How a game ended: by the rules of the final position, or by resigning. */
export type GameEndReason = "checkmate" | "stalemate" | "insufficient" | "repetition" | "fifty" | "resigned";

export interface Game {
  id: string;
  /** Rating of the computer level. */
  level: number;
  player: "w" | "b";
  /** With the engine's best move shown; never rated. */
  assisted: boolean;
  /** Every move, in UCI. */
  moves: string[];
  outcome: GameOutcome | null;
  reason: GameEndReason | null;
  /** Null for a game that was not rated. */
  ratingDelta: number | null;
  ratingAfter: number | null;
  xp: number;
  startedAt: string;
  finishedAt: string | null;
}

export interface GameStats {
  rating: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** The game in progress, if any. */
  current: Game | null;
}

/** Everything the app shows about a person's progress. */
export interface ProgressView {
  xp: number;
  streak: Streak;
  lessons: Record<string, LessonStats>;
  /** Personal records for timed drills, by drill key. */
  records: Record<string, number>;
  puzzles: PuzzleStats;
  games: GameStats;
}

/* ---------- facts the app reports ---------- */

export interface LessonRunInput {
  lessonId: string;
  points: number;
  maxPoints: number;
  mistakes: string[];
  records: { key: string; value: number }[];
  /** The player's local day, for the streak. */
  day: string;
}

export interface LessonRunOutcome {
  xp: number;
  pct: number;
  stars: Stars;
}

export interface PuzzleAttemptInput {
  puzzleId: string;
  status: PuzzleStatus;
  day: string;
}

export interface PuzzleAttempt {
  id: number;
  puzzleId: string;
  status: PuzzleStatus;
  puzzleRating: number;
  ratingDelta: number;
  ratingAfter: number;
  xp: number;
  at: string;
}

export interface GameStartInput {
  level: number;
  player: "w" | "b";
  assisted: boolean;
}

/**
 * The end of a game. The server replays the moves and reads the outcome off the
 * final position; the only thing it takes on trust is a resignation.
 */
export interface GameFinishInput {
  moves: string[];
  resigned: boolean;
  day: string;
}

export interface Page<T> {
  total: number;
  items: T[];
}

/* ---------- the backup file ---------- */

/** Version 2: the rows. Version 1 (the old progress document) is still read. */
export interface BackupV2 {
  app: "lance-a-lance";
  kind: "backup";
  version: 2;
  exportedAt: string;
  data: AccountData;
}

/** A person's whole progress as rows, in the shape the backup carries. */
export interface AccountData {
  stats: {
    xp: number;
    streak: Streak;
    puzzles: Omit<PuzzleStats, "recent">;
    games: Omit<GameStats, "current">;
  };
  lessons: (LessonStats & { lessonId: string; firstCompletedAt: string | null; lastPlayedAt: string | null })[];
  lessonRuns: { lessonId: string; pct: number; stars: Stars; xp: number; mistakes: number; at: string }[];
  records: { key: string; value: number }[];
  puzzleAttempts: Omit<PuzzleAttempt, "id">[];
  games: Game[];
}
