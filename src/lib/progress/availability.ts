import { ALL_LESSONS, type LessonRef } from "@/content/curriculum";
import type { ProgressState } from "@/lib/progress/types";

/** Every ready lesson is open: the learner picks any order. "next" marks the suggested one. */
export type LessonStatus = "done" | "next" | "available" | "soon";

export function isCompleted(state: ProgressState, lessonId: string): boolean {
  return (state.lessons[lessonId]?.completions ?? 0) > 0;
}

export function lessonStatus(state: ProgressState, ref: LessonRef): LessonStatus {
  if (!ref.meta.lesson) return "soon";
  if (isCompleted(state, ref.meta.id)) return "done";
  return nextLesson(state)?.meta.id === ref.meta.id ? "next" : "available";
}

/** The first playable lesson not yet completed, in curriculum order. */
export function nextLesson(state: ProgressState): LessonRef | null {
  return ALL_LESSONS.find((ref) => ref.meta.lesson && !isCompleted(state, ref.meta.id)) ?? null;
}

/** The lesson right after `lessonId` in curriculum order. */
export function followingLesson(lessonId: string): LessonRef | null {
  const idx = ALL_LESSONS.findIndex((l) => l.meta.id === lessonId);
  const ref = ALL_LESSONS[idx + 1];
  if (!ref) return null;
  return ref.meta.lesson ? ref : null;
}

/** Completed lesson with the lowest score, good for practice. */
export function weakestLesson(state: ProgressState): LessonRef | null {
  const done = ALL_LESSONS.filter((ref) => isCompleted(state, ref.meta.id));
  if (!done.length) return null;
  return done.reduce((a, b) => ((state.lessons[b.meta.id]?.bestPct ?? 0) < (state.lessons[a.meta.id]?.bestPct ?? 0) ? b : a));
}
