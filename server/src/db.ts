import pg from "pg";
import { env } from "./env.js";
import { MIGRATIONS } from "./migrations.js";

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** Applies every migration that has not run yet. Safe to call on each boot. */
export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));

    for (const migration of MIGRATIONS) {
      if (done.has(migration.name)) continue;
      // Serialize concurrent boots: whoever gets the lock first applies it.
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [migration.name]);
        const already = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [migration.name]);
        if (already.rowCount === 0) {
          await client.query(migration.sql);
          await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
          console.log(`migration applied: ${migration.name}`);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    client.release();
  }
}

/** Waits for Postgres to accept connections; Easypanel may start it alongside. */
export async function waitForDatabase(attempts = 30): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (i === attempts) throw error;
      const wait = Math.min(1000 * i, 5000);
      console.log(`database not ready (${(error as Error).message}); retrying in ${wait}ms`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}
