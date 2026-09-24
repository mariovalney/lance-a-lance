import { useCallback, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { OfflineScreen } from "@/components/home/OfflineScreen";
import { storageIdentity } from "@/lib/auth/context";
import { useAuth } from "@/lib/auth/useAuth";
import { BACKUP_VERSION, type Backup } from "@/lib/progress/backup";
import { ProgressContext } from "@/lib/progress/context";
import { START_RATING, applyPuzzle, applyRun } from "@/lib/progress/scoring";
import { LOG_CHUNK, connectRemote, loadLocal, loadLocalLog, saveLocal, saveLocalLog, type RemoteStore } from "@/lib/progress/storage";
import { emptyProgress, type LessonRunResult, type ProgressState, type PuzzleLogEntry, type PuzzleResult } from "@/lib/progress/types";

/** Merge two copies of a log chunk, keeping every filled slot. */
function mergeChunk(a: (PuzzleLogEntry | null)[] | null, b: (PuzzleLogEntry | null)[] | null): (PuzzleLogEntry | null)[] {
  const len = Math.max(a?.length ?? 0, b?.length ?? 0);
  return Array.from({ length: len }, (_, i) => a?.[i] ?? b?.[i] ?? null);
}

export const ProgressProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const identity = storageIdentity(auth.state);
  /**
   * Only a page with no API behind it keeps progress in the browser. Behind an
   * account the account is the only copy, and what would be the browser's is
   * held in memory for this visit and thrown away with the tab.
   */
  const inBrowser = identity === "no-api";
  const [state, setState] = useState<ProgressState>(() => (inBrowser ? (loadLocal() ?? emptyProgress()) : emptyProgress()));
  // Nothing to wait for when this browser is the store; with an account the
  // course would flash empty before the first load answers.
  const [phase, setPhase] = useState<"loading" | "ready" | "unreachable">(inBrowser ? "ready" : "loading");
  const remoteRef = useRef<RemoteStore | null>(null);
  // Mirrors `state` synchronously: the recorders need the value they just wrote
  // before React re-renders. Every `setState` below updates this ref too.
  const stateRef = useRef(state);
  // The puzzle log of a visit with an account, in place of the browser's copy.
  const memoryLog = useRef(new Map<number, (PuzzleLogEntry | null)[]>());

  const readLog = useCallback(
    (chunk: number): (PuzzleLogEntry | null)[] | null => (inBrowser ? loadLocalLog(chunk) : (memoryLog.current.get(chunk) ?? null)),
    [inBrowser],
  );

  const writeLog = useCallback(
    (chunk: number, entries: (PuzzleLogEntry | null)[]) => {
      if (inBrowser) saveLocalLog(chunk, entries as PuzzleLogEntry[]);
      else memoryLog.current.set(chunk, entries);
    },
    [inBrowser],
  );

  const keep = useCallback(
    (next: ProgressState) => {
      stateRef.current = next;
      setState(next);
      if (inBrowser) saveLocal(next);
    },
    [inBrowser],
  );

  const push = useCallback((next: ProgressState) => {
    // A failed write is caught by the next one, or by the load on the next boot.
    remoteRef.current?.save(next).catch(() => undefined);
  }, []);

  useEffect(() => {
    // Nobody to load for: the gate keeps this out of the tree until there is.
    if (identity === null) return;
    let cancelled = false;
    remoteRef.current = null;

    (async () => {
      try {
        const remote = await connectRemote(!inBrowser);
        if (cancelled) return;
        if (!remote) {
          setPhase("ready");
          return;
        }
        remoteRef.current = remote;
        const cloud = await remote.load();
        if (cancelled) return;
        if (cloud) keep(cloud);
        setPhase("ready");

        // The puzzle history lives in its own documents, which the progress
        // document above does not carry. In the background: there can be one
        // document per 100 puzzles.
        void (async () => {
          const played = stateRef.current.puzzles?.played ?? 0;
          for (let chunk = 0; chunk * LOG_CHUNK < played; chunk++) {
            if (cancelled) return;
            const there = await remote.loadLog(chunk).catch(() => null);
            const merged = mergeChunk(readLog(chunk), there);
            if (!merged.some(Boolean)) continue;
            writeLog(chunk, merged);
            // Only write back when the merge actually adds something.
            if (JSON.stringify(merged) !== JSON.stringify(there)) {
              await remote.saveLog(chunk, merged as PuzzleLogEntry[]).catch(() => undefined);
            }
          }
        })();
      } catch {
        // Progress is the account's, so there is nothing to show without it.
        if (!cancelled) setPhase("unreachable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity, inBrowser, keep, readLog, writeLog]);

  const recordRun = useCallback(
    (run: LessonRunResult) => {
      const next = applyRun(stateRef.current, run);
      keep(next);
      push(next);
      return next;
    },
    [keep, push],
  );

  const chunkOf = useCallback(
    async (chunk: number, fetchRemote: boolean) => {
      const here = readLog(chunk);
      const there = fetchRemote && remoteRef.current ? await remoteRef.current.loadLog(chunk).catch(() => null) : null;
      const merged = mergeChunk(here, there as (PuzzleLogEntry | null)[] | null);
      if (there) writeLog(chunk, merged);
      return merged;
    },
    [readLog, writeLog],
  );

  const recordPuzzle = useCallback(
    (r: PuzzleResult) => {
      const before = stateRef.current;
      const next = applyPuzzle(before, r);
      keep(next);
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
      // Write this side right away so the history sheet sees it immediately.
      const here = readLog(chunk) ?? [];
      here[index % LOG_CHUNK] = entry;
      writeLog(chunk, here);
      void (async () => {
        const entries = await chunkOf(chunk, true);
        entries[index % LOG_CHUNK] = entry;
        writeLog(chunk, entries);
        remoteRef.current?.saveLog(chunk, entries as PuzzleLogEntry[]).catch(() => undefined);
      })();
      return next;
    },
    [keep, push, chunkOf, readLog, writeLog],
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
    memoryLog.current.clear();
    keep(next);
    push(next);
  }, [keep, push]);

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
      keep(next);

      for (const [key, entries] of Object.entries(backup.puzzleLog)) {
        const chunk = Number(key);
        const merged = mergeChunk(entries, readLog(chunk));
        writeLog(chunk, merged);
        await remoteRef.current?.saveLog(chunk, merged as PuzzleLogEntry[]).catch(() => undefined);
      }

      push(next);
    },
    [keep, push, readLog, writeLog],
  );

  const value = useMemo(
    () => ({ state, recordRun, recordPuzzle, loadPuzzlePage, reset, exportBackup, importBackup }),
    [state, recordRun, recordPuzzle, loadPuzzlePage, reset, exportBackup, importBackup],
  );

  if (phase === "unreachable") return <OfflineScreen />;
  if (phase === "loading") {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );
  }
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};
