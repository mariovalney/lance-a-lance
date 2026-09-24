import { randomBytes, timingSafeEqual } from "node:crypto";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  RESET_MINUTES,
  SESSION_COOKIE,
  SESSION_DAYS,
  checkPassword,
  clearFailures,
  consumePasswordReset,
  countUsers,
  createPasswordReset,
  createSession,
  deleteSession,
  hashPassword,
  normalizeEmail,
  recordFailure,
  signInWithIdentity,
  tooManyAttempts,
  userForToken,
  verifyPassword,
  type User,
} from "../auth.js";
import { query } from "../db.js";
import { env } from "../env.js";
import { authorizeUrl, googleEnabled, identityFromCode } from "../google.js";
import { canSendMail, sendPasswordReset } from "../mail.js";

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

/**
 * Creating an account is the admin's job, by address, except for the very
 * first one: a fresh deploy is claimed by whoever signs up first, and that
 * account is the admin.
 */
authRoutes.post("/signup", async (c) => {
  if ((await countUsers()) !== 0) return c.json({ error: "signup_closed" }, 403);

  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  const password = checkPassword(body.password);
  if (!email) return c.json({ error: "invalid_email" }, 400);
  if (!password) return c.json({ error: "weak_password" }, 400);

  const hash = await hashPassword(password);
  const inserted = await query<User>(
    `INSERT INTO users (email, password, is_admin) VALUES ($1, $2, true)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, is_admin AS "isAdmin"`,
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

  const { rows } = await query<User & { password: string | null }>(
    'SELECT id, email, password, is_admin AS "isAdmin" FROM users WHERE email = $1',
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
  return c.json({ user: { id: found.id, email: found.email, isAdmin: found.isAdmin } });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: env.cookieSecure, sameSite: "Lax" });
  return c.json({ ok: true });
});

/** What the login screen should offer. */
authRoutes.get("/config", async (c) =>
  c.json({
    // Only while the deploy has not been claimed: after that the admin creates
    // the accounts, one address at a time.
    signupEnabled: (await countUsers()) === 0,
    resetEnabled: canSendMail(),
    googleEnabled: googleEnabled(),
  }),
);

/* ---------- signing in with Google ---------- */

/**
 * The state that ties the browser that started the flow to the one that comes
 * back. It is compared against the `state` Google echoes, which is the
 * double-submit cookie pattern: nothing is signed, so there is no secret.
 */
const OAUTH_COOKIE = "la_oauth";
const OAUTH_MINUTES = 10;

/** Back to the app with something the interface can turn into a sentence. */
const backToApp = (c: Context, error?: string) => c.redirect(error ? `/?erro=${encodeURIComponent(error)}` : "/", 302);

authRoutes.get("/google", (c) => {
  if (!googleEnabled()) return backToApp(c, "google_unavailable");
  const origin = appUrl(c);
  if (!origin) {
    console.error("cannot build the Google callback: set APP_URL");
    return backToApp(c, "google_failed");
  }

  const state = randomBytes(32).toString("base64url");
  setCookie(c, OAUTH_COOKIE, state, {
    path: "/api/auth",
    httpOnly: true,
    secure: env.cookieSecure,
    // Lax, so the cookie rides along when Google sends the browser back.
    sameSite: "Lax",
    maxAge: OAUTH_MINUTES * 60,
  });
  return c.redirect(authorizeUrl(origin, state), 302);
});

authRoutes.get("/google/callback", async (c) => {
  if (!googleEnabled()) return backToApp(c, "google_unavailable");

  const expected = getCookie(c, OAUTH_COOKIE);
  deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth", secure: env.cookieSecure, sameSite: "Lax" });
  const state = c.req.query("state") ?? "";
  // Nothing to compare against, or the wrong value: this browser did not start
  // the flow, or it started it too long ago.
  if (!expected || !state || expected.length !== state.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) {
    return backToApp(c, "google_state");
  }

  const code = c.req.query("code");
  if (!code) return backToApp(c, "google_failed");

  const origin = appUrl(c);
  const identity = origin ? await identityFromCode(origin, code).catch(() => null) : null;
  if (!identity) return backToApp(c, "google_failed");

  // Linking to an account that already holds the address is only safe when
  // Google says the address is theirs.
  if (!identity.emailVerified) return backToApp(c, "email_unverified");

  // Anything unexpected here lands on the sign in screen with a sentence, not
  // on the JSON that the error handler would otherwise answer with.
  const result = await signInWithIdentity("google", identity.subject, identity.email).catch((error: unknown) => {
    console.error("google: could not attach the identity:", error);
    return null;
  });
  if (!result) return backToApp(c, "google_failed");
  if (!result.ok) return backToApp(c, result.reason);

  const { token, expiresAt } = await createSession(result.user.id);
  setSessionCookie(c, token, expiresAt);
  return backToApp(c);
});

/**
 * Where the reset link points. APP_URL when set, because a forged Host
 * header would otherwise send the link to somebody else's domain.
 */
function appUrl(c: Context): string {
  if (env.appUrl) return env.appUrl;
  const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? "";
  const proto = c.req.header("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

authRoutes.post("/forgot", async (c) => {
  if (!canSendMail()) return c.json({ error: "reset_unavailable" }, 503);

  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  // Always the same answer, whether or not the account exists: otherwise this
  // endpoint tells anyone who asks which addresses are registered.
  const done = c.json({ ok: true });
  if (!email) return done;

  // Also rate limited, so it cannot be used to flood an inbox.
  const key = `forgot|${c.req.header("x-forwarded-for") ?? "local"}|${email}`;
  if (tooManyAttempts(key)) return done;
  recordFailure(key);

  const { rows } = await query<{ id: string; email: string }>("SELECT id, email FROM users WHERE email = $1", [email]);
  const user = rows[0];
  if (!user) return done;

  const origin = appUrl(c);
  if (!origin) {
    console.error("cannot build a reset link: set APP_URL");
    return done;
  }

  try {
    const token = await createPasswordReset(user.id);
    await sendPasswordReset(user.email, `${origin}/redefinir?token=${encodeURIComponent(token)}`, RESET_MINUTES);
  } catch (error) {
    // Never surfaced to the caller, for the same reason as above.
    console.error("failed to send the reset email:", error);
  }
  return done;
});

authRoutes.post("/reset", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const password = checkPassword(body.password);
  if (!token) return c.json({ error: "invalid_token" }, 400);
  if (!password) return c.json({ error: "weak_password" }, 400);

  // Signs every device out, this one included.
  const ok = await consumePasswordReset(token, password);
  if (!ok) return c.json({ error: "invalid_token" }, 400);
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: env.cookieSecure, sameSite: "Lax" });
  return c.json({ ok: true });
});
