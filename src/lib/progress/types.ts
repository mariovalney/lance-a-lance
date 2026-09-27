/**
 * Progress as the app sees it. The shapes the server answers with live in
 * `shared/types.ts`; this file adds what only the app needs: the result of a
 * lesson run before it is reported.
 */
export type {
  Game,
  GameEndReason,
  GameOutcome,
  GameStats,
  LessonStats,
  Page,
  PuzzleAttempt,
  PuzzleStats,
  PuzzleStatus,
  Stars,
  Streak,
} from "@shared/types";
import type { ProgressView } from "@shared/types";

/** Everything the app shows about the signed-in person's progress. */
export type ProgressState = ProgressView;

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
