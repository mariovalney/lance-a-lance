import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function flag(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

const production = process.env.NODE_ENV !== "development";

/**
 * `USER_API_KEYS`: who may play through `/api/v1`, as a comma separated list
 * of `email|key`. A malformed entry stops the boot rather than locking
 * somebody out without a word.
 */
function apiKeys(raw: string | undefined): { email: string; key: string }[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, i) => {
      const [email, key, extra] = entry.split("|").map((part) => part.trim());
      if (!email?.includes("@") || !key || extra !== undefined) throw new Error(`USER_API_KEYS entry ${i + 1} is not email|key`);
      if (key.length < 16) throw new Error(`USER_API_KEYS entry ${i + 1}: the key needs at least 16 characters`);
      return { email: email.toLowerCase(), key };
    });
}

export const env = {
  production,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  /** Easypanel terminates TLS in front of this, so the cookie is Secure there. */
  cookieSecure: flag("COOKIE_SECURE", production),
  /** The built PWA; by default `dist/` in the directory the server starts from (the repository root, or /app in the image). */
  staticDir: path.resolve(process.env.STATIC_DIR ?? "dist"),

  /**
   * Where the app is reachable from outside, used to build the link in a
   * password reset email. Optional: without it the link is built from the
   * request's own headers, which a forged Host header could point elsewhere.
   * Set it in production. No trailing slash.
   */
  appUrl: process.env.APP_URL?.replace(/\/+$/, "") || null,

  /**
   * Signing in with Google is optional. Without GOOGLE_CLIENT_ID there is
   * nothing to redirect to, so the whole flow is turned off, the button
   * included, rather than offered and then failing.
   *
   * The three endpoints are configurable because the end to end test points
   * them at a fake Google of its own. Production never sets them.
   */
  google: process.env.GOOGLE_CLIENT_ID
    ? {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        authUrl: process.env.GOOGLE_AUTH_URL || "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: process.env.GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
        userinfoUrl: process.env.GOOGLE_USERINFO_URL || "https://openidconnect.googleapis.com/v1/userinfo",
      }
    : null,

  /** Without any key the API at /api/v1 is off and answers 404. */
  apiKeys: apiKeys(process.env.USER_API_KEYS),

  /**
   * Sending mail is optional. Without SMTP_HOST there is no way to send a
   * reset link, so the whole flow is turned off rather than half offered.
   */
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      }
    : null,
};

export type Env = typeof env;
