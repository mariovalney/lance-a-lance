import type pg from "pg";
import { readLegacyAccount } from "./legacy.js";
import { recountGames, writeAccount } from "./account.js";

/**
 * Schema, as an ordered list. Every migration runs once, inside a transaction,
 * and is recorded in `schema_migrations`. Never edit one that has shipped: add
 * the next one instead.
 *
 * The SQL lives here rather than in .sql files so that the compiled server is a
 * single directory of JavaScript with nothing to copy alongside it. A migration
 * that moves data can also `run` code, after its SQL, in the same transaction.
 */
export interface Migration {
  name: string;
  sql: string;
  run?: (client: pg.PoolClient) => Promise<void>;
}

export const MIGRATIONS: Migration[] = [
  {
    name: "001_init",
    sql: `
      CREATE TABLE users (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email        text NOT NULL,
        password     text NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now()
      );
      -- Emails are stored lowercased and compared as stored.
      CREATE UNIQUE INDEX users_email_key ON users (email);

      CREATE TABLE sessions (
        token_hash  bytea PRIMARY KEY,
        user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX sessions_user_id_idx ON sessions (user_id);
      CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

      -- One row per user: the whole ProgressState, exactly as the client keeps
      -- it in localStorage and as the artifact database stores it.
      CREATE TABLE progress (
        user_id     uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        state       jsonb NOT NULL,
        updated_at  bigint NOT NULL,
        saved_at    timestamptz NOT NULL DEFAULT now()
      );

      -- The puzzle history, in the same chunks of 100 the client pages through.
      CREATE TABLE puzzle_log (
        user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        chunk       integer NOT NULL,
        entries     jsonb NOT NULL,
        saved_at    timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, chunk)
      );
    `,
  },
  {
    name: "002_password_resets",
    sql: `
      -- One row per reset link sent. Like sessions, only the hash of the token
      -- is stored, so a dump of the table cannot be used to take an account.
      CREATE TABLE password_resets (
        token_hash  bytea PRIMARY KEY,
        user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at  timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL,
        used_at     timestamptz
      );
      CREATE INDEX password_resets_user_id_idx ON password_resets (user_id);
      CREATE INDEX password_resets_expires_at_idx ON password_resets (expires_at);
    `,
  },
  {
    name: "003_identities",
    sql: `
      -- An account made through a provider has no password to store.
      ALTER TABLE users ALTER COLUMN password DROP NOT NULL;

      -- One row per way into an account that is not a password. A table of its
      -- own, rather than a column on users: it holds any number of providers
      -- per person without widening users every time, and it keeps users about
      -- the person rather than about how they got in.
      CREATE TABLE user_identities (
        user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        provider    text NOT NULL,
        subject     text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (provider, subject)
      );
      CREATE INDEX user_identities_user_id_idx ON user_identities (user_id);
    `,
  },
  {
    name: "004_admin",
    sql: `
      ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

      -- The first account claimed this deploy, the same rule that lets it be
      -- created with signup closed. On an empty database this changes nothing
      -- and the first account to be created becomes the admin instead.
      UPDATE users SET is_admin = true
       WHERE id = (SELECT id FROM users ORDER BY created_at, id LIMIT 1);
    `,
  },
  {
    name: "005_relational",
    sql: `
      -- Progress as rows. Until here it was one JSON document per person and
      -- the puzzle history in JSON chunks, the shape the claude.ai Artifact's
      -- key-value store imposed. The server now scores: the app reports what
      -- happened and these tables are updated in one transaction.

      -- The running totals, one row per person.
      CREATE TABLE player_stats (
        user_id             uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        xp                  integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
        streak_current      integer NOT NULL DEFAULT 0,
        streak_best         integer NOT NULL DEFAULT 0,
        streak_last_day     date,
        puzzle_rating       integer NOT NULL DEFAULT 800,
        puzzle_played       integer NOT NULL DEFAULT 0,
        puzzle_solved       integer NOT NULL DEFAULT 0,
        puzzle_streak       integer NOT NULL DEFAULT 0,
        puzzle_best_streak  integer NOT NULL DEFAULT 0,
        game_rating         integer NOT NULL DEFAULT 800,
        game_played         integer NOT NULL DEFAULT 0,
        game_wins           integer NOT NULL DEFAULT 0,
        game_draws          integer NOT NULL DEFAULT 0,
        game_losses         integer NOT NULL DEFAULT 0,
        updated_at          timestamptz NOT NULL DEFAULT now()
      );

      -- The best of each lesson, and what went wrong the last time.
      CREATE TABLE lesson_progress (
        user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        lesson_id           text NOT NULL,
        best_stars          smallint NOT NULL CHECK (best_stars BETWEEN 0 AND 3),
        best_pct            smallint NOT NULL CHECK (best_pct BETWEEN 0 AND 100),
        completions         integer NOT NULL CHECK (completions >= 0),
        last_mistakes       text[] NOT NULL DEFAULT '{}',
        first_completed_at  timestamptz,
        last_played_at      timestamptz,
        PRIMARY KEY (user_id, lesson_id)
      );

      -- Every finished lesson run.
      CREATE TABLE lesson_runs (
        id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        lesson_id  text NOT NULL,
        pct        smallint NOT NULL CHECK (pct BETWEEN 0 AND 100),
        stars      smallint NOT NULL CHECK (stars BETWEEN 0 AND 3),
        xp         integer NOT NULL CHECK (xp >= 0),
        mistakes   integer NOT NULL CHECK (mistakes >= 0),
        played_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lesson_runs_user_idx ON lesson_runs (user_id, played_at DESC);

      -- Personal bests in the timed drills.
      CREATE TABLE drill_records (
        user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        key         text NOT NULL,
        value       integer NOT NULL,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, key)
      );

      -- Every rated puzzle attempt; the trainer's history and its "recently
      -- seen" list are queries over it.
      CREATE TABLE puzzle_attempts (
        id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        puzzle_id      text NOT NULL,
        status         text NOT NULL CHECK (status IN ('ok', 'erro', 'solucao')),
        puzzle_rating  integer NOT NULL,
        rating_delta   integer NOT NULL,
        rating_after   integer NOT NULL,
        xp             integer NOT NULL CHECK (xp >= 0),
        attempted_at   timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX puzzle_attempts_user_idx ON puzzle_attempts (user_id, attempted_at DESC, id DESC);

      -- Games against the computer. A game is open while finished_at is null;
      -- its moves are saved as it goes, so a reload or another device picks it
      -- up. A finished row keeps what it did to the rating, for the history.
      CREATE TABLE games (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        level         integer NOT NULL,
        player        char(1) NOT NULL CHECK (player IN ('w', 'b')),
        assisted      boolean NOT NULL DEFAULT false,
        moves         text[] NOT NULL DEFAULT '{}',
        outcome       text CHECK (outcome IN ('win', 'draw', 'loss')),
        reason        text CHECK (reason IN ('checkmate', 'stalemate', 'insufficient', 'repetition', 'fifty', 'resigned')),
        rating_delta  integer,
        rating_after  integer,
        xp            integer NOT NULL DEFAULT 0,
        started_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        finished_at   timestamptz,
        CHECK ((finished_at IS NULL) = (outcome IS NULL) AND (outcome IS NULL) = (reason IS NULL))
      );
      -- One open game per person.
      CREATE UNIQUE INDEX games_one_open_idx ON games (user_id) WHERE finished_at IS NULL;
      -- The history, newest first.
      CREATE INDEX games_history_idx ON games (user_id, finished_at DESC) WHERE finished_at IS NOT NULL;
    `,
    // Every progress document and its puzzle chunks become rows, through the
    // same conversion the backup importer uses for a version 1 file; then the
    // old tables go. One transaction: it all lands, or nothing changes.
    async run(client) {
      const { rows } = await client.query<{ user_id: string; state: unknown }>("SELECT user_id, state FROM progress");
      for (const row of rows) {
        const chunks = await client.query<{ chunk: number; entries: unknown }>("SELECT chunk, entries FROM puzzle_log WHERE user_id = $1 ORDER BY chunk", [
          row.user_id,
        ]);
        const log = Object.fromEntries(chunks.rows.map((c) => [String(c.chunk), c.entries]));
        const data = readLegacyAccount(row.state, log);
        await writeAccount(client, row.user_id, data);
        const attempts = await client.query<{ n: string }>("SELECT count(*) AS n FROM puzzle_attempts WHERE user_id = $1", [row.user_id]);
        if (Number(attempts.rows[0].n) !== data.puzzleAttempts.length) throw new Error(`puzzle attempts of ${row.user_id} did not all land`);
      }
      await client.query("DROP TABLE puzzle_log");
      await client.query("DROP TABLE progress");
    },
  },
  {
    // 005 carried the game totals of the first games version, which saved no
    // games. The totals are counted from the saved games from now on.
    name: "006_game_stats_from_rows",
    sql: "",
    run: (client) => recountGames(client, null),
  },
];
