import TRAINER from "../src/content/data/trainer.json" with { type: "json" };

/**
 * The trainer's puzzle ratings by Lichess id. The server takes a puzzle's
 * rating from here rather than from whoever reports the attempt.
 */
const RATINGS = new Map((TRAINER.puzzles as { i: string; r: number }[]).map((p) => [p.i, p.r]));

export function puzzleRating(id: string): number | undefined {
  return RATINGS.get(id);
}
