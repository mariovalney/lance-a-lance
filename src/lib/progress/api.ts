import { call } from "@/lib/auth/api";
import type {
  BackupV2,
  Game,
  GameStartInput,
  LessonRunInput,
  LessonRunOutcome,
  Page,
  PositionEval,
  ProgressView,
  PuzzleAttempt,
  PuzzleStatus,
} from "@shared/types";
import { localDay } from "@/lib/progress/scoring";

/** The progress endpoints. Every write answers with the new read model. */

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const progressApi = {
  load: () => call<{ progress: ProgressView }>("/progress"),
  reset: () => call<{ progress: ProgressView }>("/progress/reset", { method: "POST" }),

  recordRun: (run: Omit<LessonRunInput, "day">) =>
    call<{ progress: ProgressView; run: LessonRunOutcome }>("/lessons/runs", post({ ...run, day: localDay() })),

  recordPuzzle: (puzzleId: string, status: PuzzleStatus) =>
    call<{ progress: ProgressView; attempt: PuzzleAttempt }>("/puzzles/attempts", post({ puzzleId, status, day: localDay() })),
  puzzlePage: (page: number, size: number) => call<Page<PuzzleAttempt>>(`/puzzles/attempts?page=${page}&size=${size}`),

  startGame: (input: GameStartInput) => call<{ progress: ProgressView; game: Game }>("/games", post(input)),
  saveMoves: (id: string, moves: string[]) => call<{ ok: boolean }>(`/games/${id}/moves`, { method: "PUT", body: JSON.stringify({ moves }) }),
  finishGame: (id: string, moves: string[], resigned: boolean) =>
    call<{ progress: ProgressView; game: Game }>(`/games/${id}/finish`, post({ moves, resigned, day: localDay() })),
  callOffGame: (id: string) => call<{ progress: ProgressView }>(`/games/${id}`, { method: "DELETE" }),
  gamePage: (page: number, size: number) => call<Page<Game>>(`/games?page=${page}&size=${size}`),
  gameById: (id: string) => call<{ game: Game }>(`/games/${encodeURIComponent(id)}`).then((answer) => answer.game),
  saveAnalysis: (id: string, analysis: PositionEval[]) =>
    call<{ game: Game }>(`/games/${encodeURIComponent(id)}/analysis`, { method: "PUT", body: JSON.stringify({ analysis }) }).then((answer) => answer.game),

  exportBackup: () => call<BackupV2>("/backup"),
  importBackup: (file: unknown) => call<{ progress: ProgressView }>("/backup", post(file)),
};
