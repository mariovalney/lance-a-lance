import { useCallback, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";
import { storageIdentity } from "@/lib/auth/context";
import { useAuth } from "@/lib/auth/useAuth";
import { BACKUP_VERSION, type Backup } from "@/lib/progress/backup";
import { ProgressContext } from "@/lib/progress/context";
import { START_RATING, applyPuzzle, applyRun } from "@/lib/progress/scoring";
import { LOG_CHUNK, connectRemote, loadLocal, loadLocalLog, newest, saveLocal, saveLocalLog, type RemoteStore } from "@/lib/progress/storage";
import {
  emptyProgress,
  type LessonRunResult,
  type ProgressState,
  type PuzzleLogEntry,
  type PuzzleResult,
  type SyncStatus,
} from "@/lib/progress/types";

/** Merge two copies of a log chunk, keeping every filled slot. */
function mergeChunk(a: (PuzzleLogEntry | null)[] | null, b: (PuzzleLogEntry | null)[] | null): (PuzzleLogEntry | null)[] {
  const len = Math.max(a?.length ?? 0, b?.length ?? 0);
  return Array.from({ length: len }, (_, i) => a?.[i] ?? b?.[i] ?? null);
}

export const ProgressProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useAuth();
  // Changes when he signs in or out, which is the signal to reconnect and
  // reconcile against whatever that account already has.
  const identity = storageIdentity(auth.state);
  const [state, setState] = useState<ProgressState>(() => loadLocal() ?? emptyProgress());
  // Tagged with the identity it describes, so that signing in or out shows
  // "Conectando" again without having to write state from an effect.
  const [syncState, setSyncState] = useState<{ for: string | null; status: SyncStatus }>({ for: null, status: "loading" });
  const sync = syncState.for === identity ? syncState.status : "loading";
  const remoteRef = useRef<RemoteStore | null>(null);
  // Mirrors `state` synchronously: the recorders need the value they just wrote
  // before React re-renders. Every `setState` below updates this ref too.
  const stateRef = useRef(state);

  const setSync = useCallback((status: SyncStatus) => setSyncState({ for: identity, status }), [identity]);

  const push = useCallback(
    (next: ProgressState) => {
      const remote = remoteRef.current;
      if (!remote) return;
      setSync("syncing");
      remote
        .save(next)
        .then(() => setSync("cloud"))
        .catch(() => setSync("error"));
    },
    [setSync],
  );

  useEffect(() => {
    // Still asking the server who is signed in: keep showing "Conectando".
    if (identity === null) return;
    let cancelled = false;
    remoteRef.current = null;
    (async () => {
      try {
        const remote = await connectRemote(identity.startsWith("account:"));
        if (cancelled) return;
        if (!remote) {
          setSync("local");
          return;
        }
        remoteRef.current = remote;
        const cloud = await remote.load();
        if (cancelled) return;
        const local = stateRef.current;
        const winner = newest(local.updatedAt ? local : null, cloud);
        if (winner && winner !== local) {
          stateRef.current = winner;
          setState(winner);
          saveLocal(winner);
        }
        if (winner && winner === local && local.updatedAt > (cloud?.updatedAt ?? -1)) {
          push(local);
        } else {
          setSync("cloud");
        }

        // The puzzle history lives in its own documents, which the progress
        // document above does not carry. Reconcile them too, or signing in on a
        // device that already played would leave its history behind. In the
        // background: there can be one document per 100 puzzles.
        void (async () => {
          const played = stateRef.current.puzzles?.played ?? 0;
          for (let chunk = 0; chunk * LOG_CHUNK < played; chunk++) {
            if (cancelled) return;
            const here = loadLocalLog(chunk);
            const there = await remote.loadLog(chunk).catch(() => null);
            const merged = mergeChunk(here, there);
            if (!merged.some(Boolean)) continue;
            saveLocalLog(chunk, merged as PuzzleLogEntry[]);
            // Only write back when the merge actually adds something.
            if (JSON.stringify(merged) !== JSON.stringify(there)) {
              await remote.saveLog(chunk, merged as PuzzleLogEntry[]).catch(() => undefined);
            }
          }
        })();
      } catch {
        if (!cancelled) setSync("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [push, setSync, identity]);

  const recordRun = useCallback(
    (run: LessonRunResult) => {
      const next = applyRun(stateRef.current, run);
      stateRef.current = next;
      setState(next);
      saveLocal(next);
      push(next);
      return next;
    },
    [push],
  );

  const chunkOf = useCallback(async (chunk: number, fetchRemote: boolean) => {
    const local = loadLocalLog(chunk) as (PuzzleLogEntry | null)[] | null;
    const remote = fetchRemote && remoteRef.current ? await remoteRef.current.loadLog(chunk).catch(() => null) : null;
    const merged = mergeChunk(local, remote as (PuzzleLogEntry | null)[] | null);
    if (remote) saveLocalLog(chunk, merged as PuzzleLogEntry[]);
    return merged;
  }, []);

  const recordPuzzle = useCallback(
    (r: PuzzleResult) => {
      const before = stateRef.current;
      const next = applyPuzzle(before, r);
      stateRef.current = next;
      setState(next);
      saveLocal(next);
      push(next);
      const index = before.puzzles?.played ?? 0;
      const entry: PuzzleLogEntry = {
        i: r.id,
        s: r.status,
        d: 0,
        r: next.puzzles?.rating ?? 0,
        p: r.puzzleRating,
        t: Date.now(),
      };
      entry.d = next.puzzles!.rating - (before.puzzles?.rating ?? START_RATING);
      const chunk = Math.floor(index / LOG_CHUNK);
      // Write the local copy right away so the history sheet sees it immediately.
      const local = loadLocalLog(chunk) ?? [];
      local[index % LOG_CHUNK] = entry;
      saveLocalLog(chunk, local);
      void (async () => {
        const entries = await chunkOf(chunk, true);
        entries[index % LOG_CHUNK] = entry;
        saveLocalLog(chunk, entries as PuzzleLogEntry[]);
        remoteRef.current?.saveLog(chunk, entries as PuzzleLogEntry[]).catch(() => undefined);
      })();
      return next;
    },
    [push, chunkOf],
  );

  const loadPuzzlePage = useCallback(
    async (page: number, size: number) => {
      const total = stateRef.current.puzzles?.played ?? 0;
      const hi = total - 1 - page * size;
      const lo = Math.max(0, hi - size + 1);
      if (hi < 0) return [];
      const out: PuzzleLogEntry[] = [];
      const cache = new Map<number, (PuzzleLogEntry | null)[]>();
      for (let i = hi; i >= lo; i--) {
        const chunk = Math.floor(i / LOG_CHUNK);
        if (!cache.has(chunk)) {
          let entries = await chunkOf(chunk, false);
          const needs = Array.from({ length: Math.min(hi, (chunk + 1) * LOG_CHUNK - 1) - Math.max(lo, chunk * LOG_CHUNK) + 1 }, (_, k) => Math.max(lo, chunk * LOG_CHUNK) + k);
          if (needs.some((n) => !entries[n % LOG_CHUNK])) entries = await chunkOf(chunk, true);
          cache.set(chunk, entries);
        }
        const e = cache.get(chunk)![i % LOG_CHUNK];
        if (e) out.push(e);
      }
      return out;
    },
    [chunkOf],
  );

  const reset = useCallback(() => {
    const next = { ...emptyProgress(), updatedAt: Date.now() };
    stateRef.current = next;
    setState(next);
    saveLocal(next);
    push(next);
  }, [push]);

  const exportBackup = useCallback(async (): Promise<Backup> => {
    const progress = stateRef.current;
    const played = progress.puzzles?.played ?? 0;
    const puzzleLog: Backup["puzzleLog"] = {};
    for (let chunk = 0; chunk * LOG_CHUNK < played; chunk++) {
      const entries = await chunkOf(chunk, true);
      if (entries.some(Boolean)) puzzleLog[String(chunk)] = entries;
    }
    return { app: "lance-a-lance", kind: "backup", version: BACKUP_VERSION, exportedAt: new Date().toISOString(), progress, puzzleLog };
  }, [chunkOf]);

  const importBackup = useCallback(
    async (backup: Backup) => {
      // Stamped as of now, so that this copy wins against whatever the cloud
      // and the other devices hold.
      const next = { ...backup.progress, updatedAt: Date.now() };
      stateRef.current = next;
      setState(next);
      saveLocal(next);

      for (const [key, entries] of Object.entries(backup.puzzleLog)) {
        const chunk = Number(key);
        const merged = mergeChunk(entries, loadLocalLog(chunk));
        saveLocalLog(chunk, merged as PuzzleLogEntry[]);
        await remoteRef.current?.saveLog(chunk, merged as PuzzleLogEntry[]).catch(() => undefined);
      }

      push(next);
    },
    [push],
  );

  const value = useMemo(
    () => ({ state, sync, recordRun, recordPuzzle, loadPuzzlePage, reset, exportBackup, importBackup }),
    [state, sync, recordRun, recordPuzzle, loadPuzzlePage, reset, exportBackup, importBackup],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};
