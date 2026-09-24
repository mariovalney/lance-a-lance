import { createContext } from "react";
import type { Backup } from "@/lib/progress/backup";
import type { LessonRunResult, ProgressState, PuzzleLogEntry, PuzzleResult } from "@/lib/progress/types";

export interface ProgressContextValue {
  state: ProgressState;
  recordRun: (run: LessonRunResult) => ProgressState;
  recordPuzzle: (r: PuzzleResult) => ProgressState;
  /** Newest first; page 0 is the most recent. */
  loadPuzzlePage: (page: number, size: number) => Promise<PuzzleLogEntry[]>;
  reset: () => void;
  /** The progress document plus every chunk of the puzzle history. */
  exportBackup: () => Promise<Backup>;
  /** Replaces everything with the file's contents, here and in the cloud. */
  importBackup: (backup: Backup) => Promise<void>;
}

/** Provided by `ProgressProvider`; read it with `useProgress`. */
export const ProgressContext = createContext<ProgressContextValue | null>(null);
