import { useCallback, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";
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
  const [state, setState] = useState<ProgressState>(() => loadLocal() ?? emptyProgress());
  const [sync, setSync] = useState<SyncStatus>("loading");
  const remoteRef = useRef<RemoteStore | null>(null);
  // Mirrors `state` synchronously: the recorders need the value they just wrote
  // before React re-renders. Every `setState` below updates this ref too.
  const stateRef = useRef(state);

  const push = useCallback((next: ProgressState) => {
    const remote = remoteRef.current;
    if (!remote) return;
    setSync("syncing");
    remote
      .save(next)
      .then(() => setSync("cloud"))
      .catch(() => setSync("error"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await connectRemote();
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
      } catch {
        if (!cancelled) setSync("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [push]);

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

  const value = useMemo(
    () => ({ state, sync, recordRun, recordPuzzle, loadPuzzlePage, reset }),
    [state, sync, recordRun, recordPuzzle, loadPuzzlePage, reset],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};
