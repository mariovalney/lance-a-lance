/**
 * Managing the people who can use the app. Only the admin gets here: the first
 * account created claims the deploy, and after that accounts are made here, one
 * address at a time.
 *
 * An account made here has no password and no provider yet. Its owner gets in
 * with Google, if the address matches, or by asking for a password through
 * "Esqueci a senha". Nothing else is needed, which is why there is no invite
 * table and no temporary password.
 */
import { Hono } from "hono";
import { normalizeEmail, type User } from "../auth.js";
import { query } from "../db.js";
import { requireUser, type Vars } from "./auth.js";

interface Row {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  /** How they can get in, for the interface to show as it likes. */
  hasPassword: boolean;
  providers: string[];
  xp: number;
  lessons: number;
  lastSeen: string | null;
}

export const adminRoutes = new Hono<Vars>();

adminRoutes.use("*", requireUser);
adminRoutes.use("*", async (c, next) => {
  if (!c.get("user").isAdmin) return c.json({ error: "forbidden" }, 403);
  await next();
});

adminRoutes.get("/users", async (c) => {
  const { rows } = await query<Row>(
    `SELECT u.id,
            u.email,
            u.is_admin                             AS "isAdmin",
            u.created_at                           AS "createdAt",
            u.password IS NOT NULL                 AS "hasPassword",
            COALESCE(i.providers, '{}')            AS providers,
            COALESCE((p.state ->> 'xp')::int, 0)   AS xp,
            COALESCE(jsonb_array_length(jsonb_path_query_array(p.state -> 'lessons', '$.keyvalue()')), 0) AS lessons,
            s.last_seen                            AS "lastSeen"
       FROM users u
       LEFT JOIN progress p ON p.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT array_agg(provider ORDER BY provider) AS providers
           FROM user_identities WHERE user_id = u.id
       ) i ON true
       LEFT JOIN LATERAL (
         SELECT max(last_seen_at) AS last_seen FROM sessions WHERE user_id = u.id
       ) s ON true
      ORDER BY u.created_at`,
  );
  return c.json({ users: rows });
});

adminRoutes.post("/users", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email) return c.json({ error: "invalid_email" }, 400);

  const { rows } = await query<User>(
    `INSERT INTO users (email, password) VALUES ($1, NULL)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, is_admin AS "isAdmin"`,
    [email],
  );
  if (!rows[0]) return c.json({ error: "email_taken" }, 409);
  return c.json({ user: rows[0] });
});

adminRoutes.delete("/users/:id", async (c) => {
  const id = c.req.param("id");
  // Deleting yourself would leave nobody able to open this page.
  if (id === c.get("user").id) return c.json({ error: "cannot_remove_self" }, 400);

  const { rowCount } = await query("DELETE FROM users WHERE id = $1", [id]);
  if (!rowCount) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

adminRoutes.post("/users/:id/admin", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const isAdmin = body.isAdmin === true;
  // Same reason: the app must never be left with nobody who can administer it.
  if (id === c.get("user").id && !isAdmin) return c.json({ error: "cannot_remove_self" }, 400);

  const { rows } = await query<User>(
    `UPDATE users SET is_admin = $2 WHERE id = $1 RETURNING id, email, is_admin AS "isAdmin"`,
    [id, isAdmin],
  );
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  return c.json({ user: rows[0] });
});
