import type { RecordEntry } from "@/lib/progress/types";

export interface ExerciseResult {
  key: string;
  points: number;
  max: number;
  firstTry: boolean;
  /** Present when the answer was not perfect. */
  mistakeNote?: string;
  record?: RecordEntry;
}

export type StepDone = (result: ExerciseResult | null) => void;
