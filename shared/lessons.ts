/**
 * The version of each lesson's content. A lesson whose content changed enough
 * to be worth playing again gets a higher number: its first run on the new
 * version earns full XP, and the home marks it "Nova versão" until then.
 * Lessons not listed are at version 1.
 */
const REWORKED = [
  ...[1, 2, 3, 4, 5, 6].map((n) => `m5-l${n}`),
  ...[1, 2, 3, 4].map((n) => `m6-l${n}`),
  ...[1, 2, 3, 4].map((n) => `m7-l${n}`),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => `m8-l${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `m9-l${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `m10-l${n}`),
  ...[1, 2, 3, 4, 5].map((n) => `m11-l${n}`),
];

export const LESSON_VERSIONS: Record<string, number> = Object.fromEntries(REWORKED.map((id) => [id, 2]));

export function lessonVersion(lessonId: string): number {
  return LESSON_VERSIONS[lessonId] ?? 1;
}
