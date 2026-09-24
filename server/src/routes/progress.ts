import { Hono } from "hono";
import { query } from "../db.js";
import { requireUser, type Vars } from "./auth.js";

export const progressRoutes = new Hono<Vars>();
progressRoutes.use("*", requireUser);

/**
 * The whole ProgressState, stored as one document per user, exactly like the
 * artifact database does. Writes are last-one-wins; the client reconciles on
 * load by keeping whichever copy has the newer `updatedAt`.
 */
function isProgress(value: unknown): value is { version: 1; xp: number; updatedAt?: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { version?: unknown }).version === 1 &&
    typeof (value as { xp?: unknown }).xp === "number"
  );
}

progressRoutes.get("/", async (c) => {
  const { rows } = await query<{ state: unknown }>("SELECT state FROM progress WHERE user_id = $1", [c.get("user").id]);
  return c.json({ state: rows[0]?.state ?? null });
});

progressRoutes.put("/", async (c) => {
  const state = await c.req.json().catch(() => null);
  if (!isProgress(state)) return c.json({ error: "invalid_state" }, 400);
  await query(
    `INSERT INTO progress (user_id, state, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = EXCLUDED.updated_at, saved_at = now()`,
    [c.get("user").id, state, Number(state.updatedAt ?? 0)],
  );
  return c.json({ ok: true });
});

/** The puzzle history, in the same chunks of 100 the client pages through. */
export const puzzleLogRoutes = new Hono<Vars>();
puzzleLogRoutes.use("*", requireUser);

function chunkOf(raw: string): number | null {
  const chunk = Number(raw);
  return Number.isInteger(chunk) && chunk >= 0 && chunk < 100_000 ? chunk : null;
}

puzzleLogRoutes.get("/:chunk", async (c) => {
  const chunk = chunkOf(c.req.param("chunk"));
  if (chunk === null) return c.json({ error: "invalid_chunk" }, 400);
  const { rows } = await query<{ entries: unknown }>("SELECT entries FROM puzzle_log WHERE user_id = $1 AND chunk = $2", [
    c.get("user").id,
    chunk,
  ]);
  return c.json({ entries: rows[0]?.entries ?? null });
});

puzzleLogRoutes.put("/:chunk", async (c) => {
  const chunk = chunkOf(c.req.param("chunk"));
  if (chunk === null) return c.json({ error: "invalid_chunk" }, 400);
  const body = await c.req.json().catch(() => null);
  const entries = body?.entries;
  // 100 per chunk, and the client pads unfilled slots with null.
  if (!Array.isArray(entries) || entries.length > 100) return c.json({ error: "invalid_entries" }, 400);
  await query(
    `INSERT INTO puzzle_log (user_id, chunk, entries) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, chunk) DO UPDATE SET entries = EXCLUDED.entries, saved_at = now()`,
    [c.get("user").id, chunk, JSON.stringify(entries)],
  );
  return c.json({ ok: true });
});
