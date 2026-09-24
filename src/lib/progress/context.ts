import { createContext } from "react";
import type { LessonRunResult, ProgressState, PuzzleLogEntry, PuzzleResult, SyncStatus } from "@/lib/progress/types";

export interface ProgressContextValue {
  state: ProgressState;
  sync: SyncStatus;
  recordRun: (run: LessonRunResult) => ProgressState;
  recordPuzzle: (r: PuzzleResult) => ProgressState;
  /** Newest first; page 0 is the most recent. */
  loadPuzzlePage: (page: number, size: number) => Promise<PuzzleLogEntry[]>;
  reset: () => void;
}

/** Provided by `ProgressProvider`; read it with `useProgress`. */
export const ProgressContext = createContext<ProgressContextValue | null>(null);
