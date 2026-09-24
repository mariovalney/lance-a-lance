/**
 * Schema, as an ordered list. Every migration runs once, inside a transaction,
 * and is recorded in `schema_migrations`. Never edit one that has shipped: add
 * the next one instead.
 *
 * The SQL lives here rather than in .sql files so that the compiled server is a
 * single directory of JavaScript with nothing to copy alongside it.
 */
export interface Migration {
  name: string;
  sql: string;
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
];
