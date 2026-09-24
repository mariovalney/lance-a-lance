import { useSyncExternalStore } from "react";

export interface Settings {
  /** Where the board letters and numbers go. */
  coords: "outside" | "inside";
  sound: boolean;
  /** Last theme picked in the puzzle trainer (null = all). */
  puzzleTheme?: string | null;
}

const KEY = "lance-a-lance:settings:v1";
const DEFAULTS: Settings = { coords: "outside", sound: true };

function read(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current: Settings = read();
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* per-browser convenience only */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}
