import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  checkPassword,
  clearFailures,
  countUsers,
  createSession,
  deleteSession,
  hashPassword,
  normalizeEmail,
  recordFailure,
  tooManyAttempts,
  userForToken,
  verifyPassword,
  type User,
} from "../auth.js";
import { query } from "../db.js";
import { env } from "../env.js";

export type Vars = { Variables: { user: User } };

function setSessionCookie(c: Context, token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: env.cookieSecure,
    // Lax, not Strict: opening the app from a link or the home screen should
    // not land on a logged out page.
    sameSite: "Lax",
    expires: expiresAt,
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** Reads the session cookie and answers 401 when there is no live session. */
export const requireUser: MiddlewareHandler<Vars> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await userForToken(token) : null;
  if (!user) return c.json({ error: "unauthorized" }, 401);
  c.set("user", user);
  await next();
};

export const authRoutes = new Hono<Vars>();

authRoutes.get("/me", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await userForToken(token) : null;
  if (!user) return c.json({ user: null }, 401);
  return c.json({ user });
});

authRoutes.post("/signup", async (c) => {
  // Always allowed while there is nobody yet, so a fresh deploy can be claimed.
  const first = (await countUsers()) === 0;
  if (!env.signupEnabled && !first) return c.json({ error: "signup_closed" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = checkPassword(body.password);
  if (!email) return c.json({ error: "invalid_email" }, 400);
  if (!password) return c.json({ error: "weak_password" }, 400);

  const hash = await hashPassword(password);
  const inserted = await query<{ id: string; email: string }>(
    `INSERT INTO users (email, password) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [email, hash],
  );
  const user = inserted.rows[0];
  if (!user) return c.json({ error: "email_taken" }, 409);

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(c, token, expiresAt);
  return c.json({ user });
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return c.json({ error: "invalid_credentials" }, 400);

  const key = `${c.req.header("x-forwarded-for") ?? "local"}|${email}`;
  if (tooManyAttempts(key)) return c.json({ error: "too_many_attempts" }, 429);

  const { rows } = await query<{ id: string; email: string; password: string }>(
    "SELECT id, email, password FROM users WHERE email = $1",
    [email],
  );
  const found = rows[0];
  const ok = found ? await verifyPassword(password, found.password) : false;
  if (!found || !ok) {
    recordFailure(key);
    return c.json({ error: "invalid_credentials" }, 401);
  }

  clearFailures(key);
  const { token, expiresAt } = await createSession(found.id);
  setSessionCookie(c, token, expiresAt);
  return c.json({ user: { id: found.id, email: found.email } });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: env.cookieSecure, sameSite: "Lax" });
  return c.json({ ok: true });
});

/** Whether the login screen should offer to create an account. */
authRoutes.get("/config", async (c) => c.json({ signupEnabled: env.signupEnabled || (await countUsers()) === 0 }));
