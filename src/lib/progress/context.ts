import { createContext } from "react";
import type { BackupV2, GameStartInput, LessonRunOutcome, PositionEval } from "@shared/types";
import type { Game, LessonRunResult, Page, ProgressState, PuzzleAttempt, PuzzleStatus } from "@/lib/progress/types";

export interface ProgressContextValue {
  state: ProgressState;
  /** Reports a finished lesson run; answers with what the server scored. */
  recordRun: (run: LessonRunResult) => Promise<LessonRunOutcome>;
  /** Reports a rated puzzle attempt. */
  recordPuzzle: (puzzleId: string, status: PuzzleStatus) => Promise<PuzzleAttempt>;
  /** Newest first. */
  loadPuzzlePage: (page: number, size: number) => Promise<Page<PuzzleAttempt>>;
  games: {
    start: (input: GameStartInput) => Promise<Game>;
    /** Saves the moves so far; the latest call wins. */
    saveMoves: (id: string, moves: string[]) => void;
    /** The server reads the result off the final position; `resigned` is the only thing it takes as given. */
    finish: (id: string, moves: string[], resigned: boolean) => Promise<Game>;
    /** Only before both sides moved. */
    callOff: (id: string) => Promise<void>;
    /** Finished games, newest first; `assisted` keeps one kind only. */
    page: (page: number, size: number, assisted?: boolean) => Promise<Page<Game>>;
    /** A finished game of this account; `not_found` for anyone else's. */
    get: (id: string) => Promise<Game>;
    /** Keeps the engine's evaluation of every position with a finished game. */
    saveAnalysis: (id: string, analysis: PositionEval[]) => Promise<Game>;
  };
  reset: () => Promise<void>;
  exportBackup: () => Promise<BackupV2>;
  /** Replaces the whole account with a backup file (version 1 or 2). */
  importBackup: (file: unknown) => Promise<void>;
}

/** Provided by `ProgressProvider`; read it with `useProgress`. */
export const ProgressContext = createContext<ProgressContextValue | null>(null);
