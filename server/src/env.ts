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
