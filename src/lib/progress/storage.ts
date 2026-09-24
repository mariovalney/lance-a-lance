import { emptyProgress, type ProgressState, type PuzzleLogEntry } from "@/lib/progress/types";

const LS_KEY = "lance-a-lance:progress:v1";

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
 * Picks where the cloud copy lives:
 *
 * - inside claude.ai, the artifact database;
 * - on the PWA with somebody signed in, the API in `server/`;
 * - otherwise null, and the app runs on this browser's copy alone.
 */
export async function connectRemote(signedIn: boolean): Promise<RemoteStore | null> {
  const artifact = await connectArtifact();
  if (artifact) return artifact;
  return signedIn ? httpStore() : null;
}

/** Reads and writes through the API. Same origin, so the cookie rides along. */
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

/**
 * The artifact database (progress/<viewer id>).
 * Resolves null when the page runs outside claude.ai or without a viewer id.
 */
async function connectArtifact(): Promise<RemoteStore | null> {
  const runtime = typeof window !== "undefined" ? window.claude : undefined;
  if (!runtime?.use) return null;
  const [db, user] = await Promise.all([runtime.use("db"), runtime.use("user")]);
  if (!db || !user) return null;
  const id = await user.id();
  if (!id) return null;
  const ref = db.doc(`progress/${id}`);
  const logRef = (chunk: number) => db.doc(`puzzlelog/${id}_${chunk}`);

  let chain: Promise<void> = Promise.resolve();
  let logChain: Promise<void> = Promise.resolve();
  return {
    async load() {
      const snap = await ref.get();
      if (!snap.exists) return null;
      const data = snap.data();
      return isProgress(data) ? normalize(data) : null;
    },
    save(state) {
      // One write at a time per document.
      chain = chain
        .catch(() => undefined)
        .then(() => ref.set(JSON.parse(JSON.stringify(state)) as Record<string, unknown>));
      return chain;
    },
    async loadLog(chunk) {
      const snap = await logRef(chunk).get();
      const data = snap.exists ? snap.data() : undefined;
      return data && Array.isArray(data.entries) ? (data.entries as PuzzleLogEntry[]) : null;
    },
    saveLog(chunk, entries) {
      logChain = logChain.catch(() => undefined).then(() => logRef(chunk).set({ entries, updatedAt: Date.now() }));
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
