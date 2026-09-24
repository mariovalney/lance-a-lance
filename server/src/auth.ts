import { randomBytes, createHash, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { query } from "./db.js";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: object) => Promise<Buffer>;

/** ~16 MB of memory per hash, which is the usual interactive setting. */
const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

export const SESSION_COOKIE = "la_session";
/** Long enough that he never has to log in again on a phone he keeps using. */
export const SESSION_DAYS = 400;

export interface User {
  id: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, key] = stored.split("$");
  if (scheme !== "scrypt") return false;
  try {
    const expected = Buffer.from(key, "base64");
    const actual = await scrypt(password, Buffer.from(salt, "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Only the hash is stored, so a dump of the table cannot be replayed. */
const tokenHash = (token: string) => createHash("sha256").update(token).digest();

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [tokenHash(token), userId, expiresAt]);
  return { token, expiresAt };
}

export async function userForToken(token: string): Promise<User | null> {
  const { rows } = await query<{ id: string; email: string }>(
    `SELECT u.id, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash(token)],
  );
  const user = rows[0];
  if (!user) return null;
  // Cheap last-seen bookkeeping; never blocks the request.
  void query("UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1", [tokenHash(token)]).catch(() => undefined);
  return user;
}

export async function deleteSession(token: string): Promise<void> {
  await query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]);
}

export async function deleteExpiredSessions(): Promise<number> {
  const { rowCount } = await query("DELETE FROM sessions WHERE expires_at <= now()");
  return rowCount ?? 0;
}

export async function countUsers(): Promise<number> {
  const { rows } = await query<{ count: string }>("SELECT count(*)::text AS count FROM users");
  return Number(rows[0]?.count ?? 0);
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  // Deliberately loose: the point is to catch typos, not to police addresses.
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function checkPassword(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length < 8 || value.length > 200) return null;
  return value;
}

/**
 * Slows down guessing without a dependency: a few tries per key per window,
 * held in memory. One process, one personal app, so this is enough.
 */
const attempts = new Map<string, { count: number; until: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function tooManyAttempts(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry || entry.until < Date.now()) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.until < now) attempts.set(key, { count: 1, until: now + WINDOW_MS });
  else entry.count += 1;
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
