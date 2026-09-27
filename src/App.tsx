import { useEffect, useState, type FC } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { findLesson, lessonCode, type LessonRef } from "@/content/curriculum";
import type { LessonRunResult } from "@/lib/progress/types";
import type { LessonRunOutcome } from "@shared/types";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { useAuth } from "@/lib/auth/useAuth";
import { ProgressProvider } from "@/lib/progress/ProgressContext";
import { useProgress } from "@/lib/progress/useProgress";
import { followingLesson } from "@/lib/progress/availability";
import { HomeScreen } from "@/components/home/HomeScreen";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { ResultScreen } from "@/components/result/ResultScreen";
import { PuzzleTrainer } from "@/components/trainer/PuzzleTrainer";
import { GameScreen } from "@/components/game/GameScreen";
import { GameReview } from "@/components/game/GameReview";
import { GameHistory } from "@/components/game/GameHistory";
import { ResetScreen } from "@/components/home/ResetScreen";
import { SignInScreen } from "@/components/home/SignInScreen";
import { OfflineScreen } from "@/components/home/OfflineScreen";
import { AdminScreen } from "@/components/admin/AdminScreen";
import { goBack, navigate, paths, useRoute } from "@/lib/router";

/** A finished lesson run, shown at the lesson's address until the next run starts. */
interface Finished {
  lessonId: string;
  run: number;
  result: LessonRunResult;
  /** What the server scored. */
  outcome: LessonRunOutcome;
  xpBefore: number;
  xpAfter: number;
  prevRecords: Record<string, number>;
}

/** Moves the address elsewhere once rendered: never during a render. */
const Redirect: FC<{ to: string }> = ({ to }) => {
  useEffect(() => navigate(to, { replace: true }), [to]);
  return null;
};

const Shell: FC = () => {
  const { state, recordRun } = useProgress();
  const route = useRoute();
  // Bumped for every run, so repeating a lesson draws new examples.
  const [run, setRun] = useState(1);
  const [finished, setFinished] = useState<Finished | null>(null);

  const start = (ref: LessonRef, { replace = false } = {}) => {
    if (!ref.meta.lesson) return;
    setFinished(null);
    setRun((n) => n + 1);
    navigate(paths.lesson(ref.meta.id), { replace });
  };

  const goHome = () => goBack(paths.home);

  // A finished run is reported before its result shows: the server scores it.
  const [unsaved, setUnsaved] = useState<{ lessonId: string; result: LessonRunResult } | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (lessonId: string, result: LessonRunResult) => {
    const xpBefore = state.xp;
    const prevRecords = state.records;
    setSaving(true);
    try {
      const outcome = await recordRun(result);
      setUnsaved(null);
      setFinished({ lessonId, run, result, outcome, xpBefore, xpAfter: xpBefore + outcome.xp, prevRecords });
    } catch {
      setUnsaved({ lessonId, result });
    } finally {
      setSaving(false);
    }
  };

  if (route.name === "lesson") {
    const ref = findLesson(route.lessonId);
    if (!ref?.meta.lesson) return <Redirect to={paths.home} />;
    // The result shows at the lesson's address; a reload starts the lesson again.
    if (finished?.lessonId === ref.meta.id && finished.run === run) {
      return (
        <div className="h-full">
          <ResultScreen
            lessonRef={ref}
            result={finished.result}
            run={finished.outcome}
            xpBefore={finished.xpBefore}
            xpAfter={finished.xpAfter}
            prevRecords={finished.prevRecords}
            next={followingLesson(ref.meta.id)}
            onNext={(next) => start(next, { replace: true })}
            onRetry={() => start(ref)}
            onHome={goHome}
          />
        </div>
      );
    }
    return (
      <div className="h-full">
        <LessonPlayer
          key={run}
          lesson={ref.meta.lesson}
          code={lessonCode(ref)}
          onExit={goHome}
          onFinish={(result) => void save(ref.meta.id, result)}
        />
        <Dialog open={unsaved !== null} onOpenChange={(open) => !open && !saving && (setUnsaved(null), goHome())}>
          <DialogContent className="max-w-[22rem] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="font-display">A lição não foi salva</DialogTitle>
              <DialogDescription>Sem conexão com o servidor.</DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button className="h-11 w-full rounded-xl font-bold" disabled={saving} onClick={() => unsaved && void save(unsaved.lessonId, unsaved.result)}>
                Tentar de novo
              </Button>
              <Button variant="ghost" className="h-11 w-full rounded-xl text-danger hover:text-danger" disabled={saving} onClick={() => (setUnsaved(null), goHome())}>
                Sair sem salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (route.name === "trainer") {
    return (
      <div className="h-full">
        <PuzzleTrainer onExit={goHome} />
      </div>
    );
  }

  if (route.name === "game") {
    return (
      <div className="h-full">
        <GameScreen />
      </div>
    );
  }

  if (route.name === "games") {
    return (
      <div className="h-full">
        <GameHistory />
      </div>
    );
  }

  if (route.name === "gameReview") {
    return (
      <div className="h-full">
        <GameReview key={route.gameId} gameId={route.gameId} />
      </div>
    );
  }

  return <HomeScreen onStart={(ref) => start(ref)} onPuzzles={() => navigate(paths.trainer)} onGame={() => navigate(paths.game)} />;
};

/**
 * Nothing but the password reset link is reachable without an account, and the
 * progress store only mounts once there is one to load it into. Progress is
 * the account's alone, so a server that cannot be reached leaves nothing to
 * show and says so. Signing in happens at whatever address the app was opened
 * on, so it opens there once somebody is in.
 */
const Gate: FC = () => {
  const { state } = useAuth();
  const route = useRoute();

  if (route.name === "reset") {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) return <Redirect to={paths.home} />;
    return (
      <div className="h-full">
        {/* Leaving drops the token from the address bar, so a reload or a
            shared screenshot does not carry it around. */}
        <ResetScreen token={token} onDone={() => navigate(paths.home, { replace: true })} />
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="grid h-full place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );
  }

  if (state.kind === "offline") {
    return (
      <div className="h-full">
        <OfflineScreen />
      </div>
    );
  }

  if (state.kind === "anonymous") {
    return (
      <div className="h-full">
        <SignInScreen signupOpen={state.signupOpen} resetOpen={state.resetOpen} googleOpen={state.googleOpen} />
      </div>
    );
  }

  // Only the admin has anything to do here. For anyone else the address is not
  // theirs, so it goes away and the app opens as usual.
  if (route.name === "admin") {
    if (!state.account.isAdmin) return <Redirect to={paths.home} />;
    return (
      <div className="h-full">
        <AdminScreen onHome={() => goBack(paths.home)} />
      </div>
    );
  }

  return (
    <ProgressProvider key={state.account.id}>
      <Shell />
    </ProgressProvider>
  );
};

const App: FC = () => (
  <AuthProvider>
    <Gate />
  </AuthProvider>
);

export default App;
