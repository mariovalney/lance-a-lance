import { useState, type FC } from "react";
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
import { ResetScreen } from "@/components/home/ResetScreen";
import { SignInScreen } from "@/components/home/SignInScreen";
import { OfflineScreen } from "@/components/home/OfflineScreen";
import { AdminScreen } from "@/components/admin/AdminScreen";

type Route =
  | { name: "home" }
  | { name: "trainer" }
  | { name: "game" }
  | { name: "lesson"; lessonId: string; run: number }
  | {
      name: "result";
      lessonId: string;
      result: LessonRunResult;
      /** What the server scored. */
      run: LessonRunOutcome;
      xpBefore: number;
      xpAfter: number;
      prevRecords: Record<string, number>;
    };

/**
 * The two addresses the app answers besides the root: where the link in a
 * password reset email lands, and the admin page. Everything else is in-memory
 * routing, and the server answers 404 for any other address, so this list is
 * the same one in `CLIENT_ROUTES` in `server/src/index.ts` and in the service
 * worker's `navigateFallbackAllowlist`.
 */
const pathname = () => (typeof window === "undefined" ? "/" : window.location.pathname.replace(/\/+$/, "") || "/");

function resetTokenFromUrl(): string | null {
  if (pathname() !== "/redefinir") return null;
  return new URLSearchParams(window.location.search).get("token");
}

/** Drops an address from the bar without reloading, when it is done with. */
function goToRoot(): void {
  if (typeof window !== "undefined" && pathname() !== "/") window.history.replaceState(null, "", "/");
}

/**
 * The screen to come back to after a reload, kept for the tab only. A lesson
 * starts over, since its examples are drawn anew on every run, and a result
 * screen goes home: what it showed is gone.
 */
const ROUTE_KEY = "lance-a-lance:route:v1";

type SavedRoute = { name: "home" | "trainer" | "game" } | { name: "lesson"; lessonId: string };

function rememberRoute(route: Route): void {
  const saved: SavedRoute = route.name === "lesson" ? { name: "lesson", lessonId: route.lessonId } : { name: route.name === "result" ? "home" : route.name };
  try {
    sessionStorage.setItem(ROUTE_KEY, JSON.stringify(saved));
  } catch {
    /* a reload goes home */
  }
}

function initialRoute(): Route {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ROUTE_KEY) ?? "null") as SavedRoute | null;
    if (saved?.name === "trainer" || saved?.name === "game") return { name: saved.name };
    if (saved?.name === "lesson" && findLesson(saved.lessonId)?.meta.lesson) return { name: "lesson", lessonId: saved.lessonId, run: 1 };
  } catch {
    /* nothing kept */
  }
  return { name: "home" };
}

const Shell: FC = () => {
  const { state, recordRun } = useProgress();
  const [route, setRouteState] = useState<Route>(initialRoute);
  const [runCounter, setRunCounter] = useState(() => (route.name === "lesson" ? route.run : 0));
  const setRoute = (next: Route) => {
    rememberRoute(next);
    setRouteState(next);
  };

  const start = (ref: LessonRef) => {
    if (!ref.meta.lesson) return;
    setRunCounter((n) => n + 1);
    setRoute({ name: "lesson", lessonId: ref.meta.id, run: runCounter + 1 });
    window.scrollTo(0, 0);
  };

  const goHome = () => {
    setRoute({ name: "home" });
    window.scrollTo(0, 0);
  };

  // A finished run is reported before its result shows: the server scores it.
  const [unsaved, setUnsaved] = useState<{ lessonId: string; result: LessonRunResult } | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (lessonId: string, result: LessonRunResult) => {
    const xpBefore = state.xp;
    const prevRecords = state.records;
    setSaving(true);
    try {
      const run = await recordRun(result);
      setUnsaved(null);
      setRoute({ name: "result", lessonId, result, run, xpBefore, xpAfter: xpBefore + run.xp, prevRecords });
    } catch {
      setUnsaved({ lessonId, result });
    } finally {
      setSaving(false);
    }
  };

  if (route.name === "lesson") {
    const ref = findLesson(route.lessonId);
    if (!ref?.meta.lesson) return null;
    return (
      <div className="h-full">
        <LessonPlayer
          key={route.run}
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

  if (route.name === "result") {
    const ref = findLesson(route.lessonId)!;
    return (
      <div className="h-full">
        <ResultScreen
          lessonRef={ref}
          result={route.result}
          run={route.run}
          xpBefore={route.xpBefore}
          xpAfter={route.xpAfter}
          prevRecords={route.prevRecords}
          next={followingLesson(ref.meta.id)}
          onNext={start}
          onRetry={() => start(ref)}
          onHome={goHome}
        />
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
        <GameScreen onExit={goHome} />
      </div>
    );
  }

  return <HomeScreen onStart={start} onPuzzles={() => setRoute({ name: "trainer" })} onGame={() => setRoute({ name: "game" })} />;
};

/**
 * Nothing but the password reset link is reachable without an account, and the
 * progress store only mounts once there is one to load it into. Progress is
 * the account's alone, so a server that cannot be reached leaves nothing to
 * show and says so.
 *
 * The exception is a page with no API behind it, a plain static host, where
 * there are no accounts to sign in to and progress stays in this browser.
 */
const Gate: FC = () => {
  const { state } = useAuth();
  const [resetToken, setResetToken] = useState(resetTokenFromUrl);
  const [admin, setAdmin] = useState(() => pathname() === "/admin");

  if (resetToken) {
    return (
      <div className="h-full">
        <ResetScreen
          token={resetToken}
          onDone={() => {
            // Drop the token from the address bar, so a reload or a shared
            // screenshot does not carry it around.
            window.history.replaceState(null, "", "/");
            setResetToken(null);
          }}
        />
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
  if (admin) {
    if (state.kind === "signed-in" && state.account.isAdmin) {
      return (
        <div className="h-full">
          <AdminScreen
            onHome={() => {
              goToRoot();
              setAdmin(false);
            }}
          />
        </div>
      );
    }
    goToRoot();
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
