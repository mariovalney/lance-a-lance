import type { AccountData, PuzzleStatus, Stars } from "../../shared/types.js";
import { DAY, PUZZLE_XP, START_RATING, starsFor } from "../../shared/scoring.js";
import { EMPTY_STATS } from "./account.js";

/**
 * The version 1 shape: one JSON document per person (what the app kept in
 * localStorage and in the `progress` table) and the puzzle history in chunks of
 * 100. Read by migration 005 and by the importer of an old backup file, so an
 * account moves to rows the same way whichever door it comes through.
 *
 * Anything missing or malformed falls back to its empty value rather than
 * failing: these documents were written by several versions of the app.
 */

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const int = (v: unknown, fallback = 0): number => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback);
const nat = (v: unknown, fallback = 0): number => Math.max(0, int(v, fallback));
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const iso = (v: unknown): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const stars = (v: unknown): Stars => Math.min(3, nat(v)) as Stars;
const pct = (v: unknown): number => Math.min(100, nat(v));
const STATUSES = new Set<PuzzleStatus>(["ok", "erro", "solucao"]);

export function readLegacyAccount(stateRaw: unknown, puzzleLog: Record<string, unknown>): AccountData {
  const state = obj(stateRaw);
  const streak = obj(state.streak);
  const puzzles = obj(state.puzzles);
  const games = obj(state.games);
  const lastDay = str(streak.lastDay);

  const lessons = Object.entries(obj(state.lessons)).map(([lessonId, raw]) => {
    const l = obj(raw);
    return {
      lessonId,
      bestStars: stars(l.bestStars),
      bestPct: pct(l.bestPct),
      completions: nat(l.completions),
      lastMistakes: Array.isArray(l.lastMistakes) ? l.lastMistakes.filter((m): m is string => typeof m === "string").slice(0, 20) : [],
      firstCompletedAt: iso(l.firstCompletedAt),
      lastPlayedAt: iso(l.lastPlayedAt),
    };
  });

  // The old history kept the last 60 runs, newest first; rows go oldest first.
  const lessonRuns = (Array.isArray(state.history) ? state.history : [])
    .map((raw) => {
      const h = obj(raw);
      const lessonId = str(h.lessonId);
      const at = iso(h.at);
      if (!lessonId || !at) return null;
      const p = pct(h.pct);
      return { lessonId, pct: p, stars: h.stars === undefined ? starsFor(p) : stars(h.stars), xp: nat(h.xp), mistakes: nat(h.mistakes), at };
    })
    .filter((r) => r !== null)
    .reverse();

  const records = Object.entries(obj(state.records))
    .filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([key, value]) => ({ key, value: Math.round(value as number) }));

  // Chunk n holds attempts n*100 to n*100+99, with null where one was lost.
  const puzzleAttempts = Object.keys(puzzleLog)
    .filter((k) => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .flatMap((k) => (Array.isArray(puzzleLog[k]) ? (puzzleLog[k] as unknown[]) : []))
    .map((raw) => {
      const e = obj(raw);
      const puzzleId = str(e.i);
      const status = e.s as PuzzleStatus;
      const at = iso(e.t);
      if (!puzzleId || !STATUSES.has(status) || !at) return null;
      return {
        puzzleId,
        status,
        puzzleRating: nat(e.p),
        ratingDelta: int(e.d),
        ratingAfter: nat(e.r, START_RATING),
        xp: PUZZLE_XP[status],
        at,
      };
    })
    .filter((a) => a !== null);

  return {
    stats: {
      xp: nat(state.xp),
      streak: {
        current: nat(streak.current),
        best: nat(streak.best),
        lastDay: lastDay && DAY.test(lastDay) ? lastDay : null,
      },
      puzzles: {
        rating: nat(puzzles.rating, START_RATING) || START_RATING,
        played: nat(puzzles.played),
        solved: nat(puzzles.solved),
        streak: nat(puzzles.streak),
        bestStreak: nat(puzzles.bestStreak),
      },
      games: {
        ...EMPTY_STATS.games,
        rating: nat(games.rating, START_RATING) || START_RATING,
        played: nat(games.played),
        wins: nat(games.wins),
        draws: nat(games.draws),
        losses: nat(games.losses),
      },
    },
    lessons,
    lessonRuns,
    records,
    puzzleAttempts,
    games: [],
  };
}

