import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AccountData, BackupV2, Game, Stars } from "../../../shared/types.js";
import { DAY } from "../../../shared/scoring.js";
import { GAME_LEVELS, MAX_MOVES, UCI } from "../../../shared/games.js";
import { isPositionEval } from "../../../shared/analysis.js";
import { readAccount, readProgress, writeAccount } from "../account.js";
import { pool, transaction } from "../db.js";
import { readLegacyAccount } from "../legacy.js";
import { requireUser, type Vars } from "./auth.js";
import { UUID, isInt } from "./util.js";

/**
 * A whole account as one JSON file, and back. Version 2 carries the rows;
 * version 1, the old progress document with its puzzle chunks, is converted the
 * way migration 005 converted the database, so an old file still restores.
 */
export const backupRoutes = new Hono<Vars>();
backupRoutes.use("*", requireUser);

backupRoutes.get("/", async (c) => {
  const backup: BackupV2 = {
    app: "lance-a-lance",
    kind: "backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: await readAccount(pool, c.get("user").id),
  };
  return c.json(backup);
});

// Years of puzzles and games fit in a few megabytes; anything past this is not a backup.
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

backupRoutes.post("/", bodyLimit({ maxSize: MAX_BACKUP_BYTES, onError: (c) => c.json({ error: "backup_too_big" }, 413) }), async (c) => {
  const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || raw.app !== "lance-a-lance" || raw.kind !== "backup") return c.json({ error: "not_a_backup" }, 400);
  let data: AccountData | null;
  if (raw.version === 1) {
    data = typeof raw.progress === "object" && raw.progress !== null ? readLegacyAccount(raw.progress, (raw.puzzleLog ?? {}) as Record<string, unknown>) : null;
  } else if (raw.version === 2) {
    data = parseAccountData(raw.data);
  } else {
    return c.json({ error: "backup_version" }, 400);
  }
  if (!data) return c.json({ error: "backup_corrupt" }, 400);
  const userId = c.get("user").id;
  await transaction((client) => writeAccount(client, userId, data));
  return c.json({ progress: await readProgress(pool, userId) });
});

/* ---------- version 2, checked field by field ---------- */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const nat = (v: unknown, max = 10_000_000) => isInt(v, 0, max);
const isStars = (v: unknown): v is Stars => isInt(v, 0, 3);
const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const isDateOrNull = (v: unknown) => v === null || isDate(v);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const every = <T>(v: unknown, check: (x: Obj) => boolean): v is T[] => Array.isArray(v) && v.every((x) => isObj(x) && check(x));
const REASONS = new Set(["checkmate", "stalemate", "insufficient", "repetition", "fifty", "resigned"]);
const OUTCOMES = new Set(["win", "draw", "loss"]);

function parseAccountData(v: unknown): AccountData | null {
  if (!isObj(v) || !isObj(v.stats)) return null;
  const s = v.stats;
  const streak = s.streak as Obj;
  const puzzles = s.puzzles as Obj;
  const games = s.games as Obj;
  const statsOk =
    nat(s.xp) &&
    isObj(streak) &&
    nat(streak.current) &&
    nat(streak.best) &&
    (streak.lastDay === null || (typeof streak.lastDay === "string" && DAY.test(streak.lastDay))) &&
    isObj(puzzles) &&
    ["rating", "played", "solved", "streak", "bestStreak"].every((k) => nat(puzzles[k])) &&
    isObj(games) &&
    ["rating", "played", "wins", "draws", "losses"].every((k) => nat(games[k]));
  if (!statsOk) return null;

  const lessonsOk = every<AccountData["lessons"][number]>(
    v.lessons,
    (l) =>
      isText(l.lessonId, 20) &&
      isStars(l.bestStars) &&
      isInt(l.bestPct, 0, 100) &&
      nat(l.completions) &&
      Array.isArray(l.lastMistakes) &&
      l.lastMistakes.every((m) => isText(m, 300)) &&
      isDateOrNull(l.firstCompletedAt) &&
      isDateOrNull(l.lastPlayedAt),
  );
  const runsOk = every<AccountData["lessonRuns"][number]>(
    v.lessonRuns,
    (r) => isText(r.lessonId, 20) && isInt(r.pct, 0, 100) && isStars(r.stars) && nat(r.xp) && nat(r.mistakes) && isDate(r.at),
  );
  const recordsOk = every<AccountData["records"][number]>(v.records, (r) => isText(r.key, 80) && nat(r.value));
  const attemptsOk = every<AccountData["puzzleAttempts"][number]>(
    v.puzzleAttempts,
    (a) =>
      isText(a.puzzleId, 20) &&
      ["ok", "erro", "solucao"].includes(a.status as string) &&
      nat(a.puzzleRating) &&
      isInt(a.ratingDelta, -1000, 1000) &&
      nat(a.ratingAfter) &&
      nat(a.xp) &&
      isDate(a.at),
  );
  const gamesOk = every<Game>(
    v.games,
    (g) =>
      typeof g.id === "string" &&
      UUID.test(g.id) &&
      GAME_LEVELS.includes(g.level as never) &&
      (g.player === "w" || g.player === "b") &&
      typeof g.assisted === "boolean" &&
      Array.isArray(g.moves) &&
      g.moves.length <= MAX_MOVES &&
      g.moves.every((m) => typeof m === "string" && UCI.test(m)) &&
      OUTCOMES.has(g.outcome as string) &&
      REASONS.has(g.reason as string) &&
      (g.ratingDelta === null || isInt(g.ratingDelta, -1000, 1000)) &&
      (g.ratingAfter === null || nat(g.ratingAfter)) &&
      nat(g.xp) &&
      isDate(g.startedAt) &&
      isDate(g.finishedAt) &&
      // Absent in the files written before the analysis existed.
      (g.analysis === undefined ||
        g.analysis === null ||
        (Array.isArray(g.analysis) && g.analysis.length === (g.moves as unknown[]).length + 1 && g.analysis.every(isPositionEval))),
  );
  if (!lessonsOk || !runsOk || !recordsOk || !attemptsOk || !gamesOk) return null;
  return v as unknown as AccountData;
}
