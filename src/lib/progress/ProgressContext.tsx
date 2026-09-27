import { useCallback, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { ApiOffline } from "@/lib/auth/api";
import { progressApi } from "@/lib/progress/api";
import { ProgressContext, type ProgressContextValue } from "@/lib/progress/context";
import type { ProgressState } from "@/lib/progress/types";
import { OfflineScreen } from "@/components/home/OfflineScreen";

/**
 * The signed-in person's progress, as the server keeps it. The app reports what
 * happened and shows the numbers the server answers with; nothing is kept in
 * the browser. This part loads it; `ProgressStore` holds it once it is here.
 */
export const ProgressProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [loaded, setLoaded] = useState<ProgressState | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    progressApi
      .load()
      .then(({ progress }) => !cancelled && setLoaded(progress))
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiOffline) setUnreachable(true);
        else throw error;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (unreachable) return <OfflineScreen />;
  if (!loaded) {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );
  }
  return <ProgressStore initial={loaded}>{children}</ProgressStore>;
};

const ProgressStore: FC<{ initial: ProgressState; children: ReactNode }> = ({ initial, children }) => {
  const [state, setState] = useState(initial);
  // Moves are saved one request at a time, in order.
  const moveChain = useRef<Promise<unknown>>(Promise.resolve());

  const recordRun = useCallback<ProgressContextValue["recordRun"]>(async (run) => {
    const answer = await progressApi.recordRun({
      lessonId: run.lessonId,
      points: run.points,
      maxPoints: run.maxPoints,
      mistakes: run.mistakes,
      records: (run.records ?? []).map((r) => ({ key: r.key, value: r.value })),
    });
    setState(answer.progress);
    return answer.run;
  }, []);

  const recordPuzzle = useCallback<ProgressContextValue["recordPuzzle"]>(async (puzzleId, status) => {
    const answer = await progressApi.recordPuzzle(puzzleId, status);
    setState(answer.progress);
    return answer.attempt;
  }, []);

  const startGame = useCallback<ProgressContextValue["games"]["start"]>(async (input) => {
    const answer = await progressApi.startGame(input);
    setState(answer.progress);
    return answer.game;
  }, []);

  const saveMoves = useCallback<ProgressContextValue["games"]["saveMoves"]>((id, moves) => {
    // A failed save is caught by the next one, which carries every move.
    moveChain.current = moveChain.current.then(() => progressApi.saveMoves(id, moves)).catch(() => undefined);
    // The read model's open game follows, so leaving the screen and coming
    // back resumes from the last move, not from when the progress loaded.
    setState((s) => (s.games.current?.id === id ? { ...s, games: { ...s.games, current: { ...s.games.current, moves } } } : s));
  }, []);

  const finishGame = useCallback<ProgressContextValue["games"]["finish"]>(async (id, moves, resigned) => {
    await moveChain.current;
    const answer = await progressApi.finishGame(id, moves, resigned);
    setState(answer.progress);
    return answer.game;
  }, []);

  const callOffGame = useCallback<ProgressContextValue["games"]["callOff"]>(async (id) => {
    await moveChain.current;
    setState((await progressApi.callOffGame(id)).progress);
  }, []);

  const reset = useCallback(async () => {
    setState((await progressApi.reset()).progress);
  }, []);

  const importBackup = useCallback(async (file: unknown) => {
    setState((await progressApi.importBackup(file)).progress);
  }, []);

  const games = useMemo<ProgressContextValue["games"]>(
    () => ({ start: startGame, saveMoves, finish: finishGame, callOff: callOffGame, page: progressApi.gamePage, get: progressApi.gameById }),
    [startGame, saveMoves, finishGame, callOffGame],
  );

  const value = useMemo<ProgressContextValue>(
    () => ({
      state,
      recordRun,
      recordPuzzle,
      loadPuzzlePage: progressApi.puzzlePage,
      games,
      reset,
      exportBackup: progressApi.exportBackup,
      importBackup,
    }),
    [state, recordRun, recordPuzzle, games, reset, importBackup],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};
