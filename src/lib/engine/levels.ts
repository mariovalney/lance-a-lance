/**
 * The computer's levels. From 1400 up the strength is Stockfish's own
 * `UCI_Elo`, which accepts 1320 to 3190. Below that there is nothing to ask it
 * for, so the weak levels search shallow at `Skill Level 0` and, now and then,
 * play a random legal move instead. Their ratings are an estimate, not a
 * measurement.
 */
export interface BotLevel {
  rating: number;
  /** Chance of a random legal move instead of the engine's. */
  randomMove: number;
  /** Search depth for the weak levels. */
  depth?: number;
  /** UCI_Elo for the levels Stockfish limits itself. */
  elo?: number;
}

export const BOT_LEVELS: BotLevel[] = [
  { rating: 400, randomMove: 0.5, depth: 1 },
  { rating: 600, randomMove: 0.35, depth: 2 },
  { rating: 800, randomMove: 0.2, depth: 3 },
  { rating: 1000, randomMove: 0.1, depth: 4 },
  { rating: 1200, randomMove: 0.05, depth: 6 },
  { rating: 1400, randomMove: 0, elo: 1400 },
  { rating: 1600, randomMove: 0, elo: 1600 },
  { rating: 1800, randomMove: 0, elo: 1800 },
  { rating: 2000, randomMove: 0, elo: 2000 },
  { rating: 2200, randomMove: 0, elo: 2200 },
  { rating: 2400, randomMove: 0, elo: 2400 },
];

/** The level closest to a rating, the easier one on a tie. */
export function levelNear(rating: number): BotLevel {
  return BOT_LEVELS.reduce((best, l) => (Math.abs(l.rating - rating) < Math.abs(best.rating - rating) ? l : best));
}

export function levelByRating(rating: number): BotLevel | undefined {
  return BOT_LEVELS.find((l) => l.rating === rating);
}
