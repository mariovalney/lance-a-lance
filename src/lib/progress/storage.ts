import { emptyProgress, type ProgressState, type PuzzleLogEntry } from "@/lib/progress/types";

const LS_KEY = "lance-a-lance:progress:v1";
/** Which account this browser's copy belongs to, if it belongs to one. */
const OWNER_KEY = "lance-a-lance:owner:v1";

function isProgress(value: unknown): value is ProgressState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ProgressState).version === 1 &&
    typeof (value as ProgressState).xp === "number"
  );
}

function normalize(value: ProgressState): ProgressState {
  const base = emptyProgress();
  return {
    ...base,
    ...value,
    lessons: value.lessons ?? {},
    streak: { ...base.streak, ...(value.streak ?? {}) },
    history: Array.isArray(value.history) ? value.history : [],
  };
}

export function loadLocal(): ProgressState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? normalize(parsed) : null;
  } catch {
    return null;
  }
}

export function saveLocal(state: ProgressState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the cloud copy (if any) still keeps progress */
  }
}

/**
 * The account whose copy is in this browser. Null when nobody has claimed it,
 * which is progress made before signing in for the first time: that copy is
 * adopted by the first account that signs in here.
 */
export function loadOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

export function saveOwner(account: string): void {
  try {
    localStorage.setItem(OWNER_KEY, account);
  } catch {
    /* storage unavailable: the cloud copy still keeps progress */
  }
}

/**
 * Wipes this browser's copy: the progress, every chunk of the puzzle log and
 * the owner. Used when somebody signs out and when a different account signs
 * in, so that a shared browser never hands one person's progress to another.
 */
export function clearLocal(): void {
  try {
    // Sound and board coordinates are this device's, not this account's, so
    // they stay.
    const doomed = Object.keys(localStorage).filter((key) => key === LS_KEY || key === OWNER_KEY || key.startsWith("lance-a-lance:puzzlelog:"));
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}

export interface RemoteStore {
  load(): Promise<ProgressState | null>;
  save(state: ProgressState): Promise<void>;
  loadLog(chunk: number): Promise<PuzzleLogEntry[] | null>;
  saveLog(chunk: number, entries: PuzzleLogEntry[]): Promise<void>;
}

/* ---------- puzzle log: every attempt, in chunks of LOG_CHUNK ---------- */

export const LOG_CHUNK = 100;
const logKey = (chunk: number) => `lance-a-lance:puzzlelog:v1:${chunk}`;

export function loadLocalLog(chunk: number): PuzzleLogEntry[] | null {
  try {
    const raw = localStorage.getItem(logKey(chunk));
    return raw ? (JSON.parse(raw) as PuzzleLogEntry[]) : null;
  } catch {
    return null;
  }
}

export function saveLocalLog(chunk: number, entries: PuzzleLogEntry[]): void {
  try {
    localStorage.setItem(logKey(chunk), JSON.stringify(entries));
  } catch {
    /* per-browser cache only */
  }
}

/**
 * Where the cloud copy lives: the API in `server/` when somebody is signed in,
 * and nowhere otherwise, which leaves the app on this browser's copy alone.
 *
 * Reads and writes go to the same origin as the page, so the session cookie
 * rides along on its own.
 */
export async function connectRemote(signedIn: boolean): Promise<RemoteStore | null> {
  return signedIn ? httpStore() : null;
}

function httpStore(): RemoteStore {
  const send = async (path: string, init?: RequestInit) => {
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${path} -> ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  };

  // One write at a time per document, same as the artifact store.
  let chain: Promise<void> = Promise.resolve();
  let logChain: Promise<void> = Promise.resolve();

  return {
    async load() {
      const { state } = await send("/progress");
      return isProgress(state) ? normalize(state) : null;
    },
    save(state) {
      chain = chain.catch(() => undefined).then(async () => {
        await send("/progress", { method: "PUT", body: JSON.stringify(state) });
      });
      return chain;
    },
    async loadLog(chunk) {
      const { entries } = await send(`/puzzlelog/${chunk}`);
      return Array.isArray(entries) ? (entries as PuzzleLogEntry[]) : null;
    },
    saveLog(chunk, entries) {
      logChain = logChain.catch(() => undefined).then(async () => {
        await send(`/puzzlelog/${chunk}`, { method: "PUT", body: JSON.stringify({ entries }) });
      });
      return logChain;
    },
  };
}

/** Picks the most recent copy. */
export function newest(a: ProgressState | null, b: ProgressState | null): ProgressState | null {
  if (!a) return b;
  if (!b) return a;
  return b.updatedAt >= a.updatedAt ? b : a;
}
