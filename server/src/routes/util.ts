import { DAY } from "../../../shared/scoring.js";

/**
 * The player's local day as the app reports it, for the streak. A day more
 * than a day away from the server's (a wrong clock, a crafted request) is
 * replaced by the server's own.
 */
export function playerDay(raw: unknown, now = new Date()): string {
  const today = now.toISOString().slice(0, 10);
  if (typeof raw !== "string" || !DAY.test(raw)) return today;
  const gap = Math.abs(Date.parse(`${raw}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`));
  return gap <= 36 * 3600 * 1000 ? raw : today;
}

export const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Page and size from the query string, or null when they make no sense. */
export function pageOf(pageRaw: string | undefined, sizeRaw: string | undefined): { page: number; size: number } | null {
  const page = Number(pageRaw ?? 0);
  const size = Number(sizeRaw ?? 20);
  return isInt(page, 0, 1_000_000) && isInt(size, 1, 200) ? { page, size } : null;
}
