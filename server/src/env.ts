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

export const env = {
  production,
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required("DATABASE_URL"),
  /**
   * Signup is closed by default, because the site is public. It is allowed
   * anyway while the users table is empty, so the first account can always be
   * created on a fresh deploy without flipping anything.
   */
  signupEnabled: flag("SIGNUP_ENABLED", false),
  /** Easypanel terminates TLS in front of this, so the cookie is Secure there. */
  cookieSecure: flag("COOKIE_SECURE", production),
  /** The built PWA. */
  staticDir: path.resolve(process.env.STATIC_DIR ?? path.join(import.meta.dirname, "../../dist")),

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
