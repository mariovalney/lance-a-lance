import { useState, type FC } from "react";
import { Loader2 } from "lucide-react";
import { findLesson, lessonCode, type LessonRef } from "@/content/curriculum";
import type { LessonRunResult } from "@/lib/progress/types";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { useAuth } from "@/lib/auth/useAuth";
import { ProgressProvider } from "@/lib/progress/ProgressContext";
import { useProgress } from "@/lib/progress/useProgress";
import { followingLesson } from "@/lib/progress/availability";
import { HomeScreen } from "@/components/home/HomeScreen";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { ResultScreen } from "@/components/result/ResultScreen";
import { PuzzleTrainer } from "@/components/trainer/PuzzleTrainer";
import { ResetScreen } from "@/components/home/ResetScreen";
import { SignInScreen } from "@/components/home/SignInScreen";
import { OfflineScreen } from "@/components/home/OfflineScreen";
import { AdminScreen } from "@/components/admin/AdminScreen";

type Route =
  | { name: "home" }
  | { name: "trainer" }
  | { name: "lesson"; lessonId: string; run: number }
  | {
      name: "result";
      lessonId: string;
      result: LessonRunResult;
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

const Shell: FC = () => {
  const { state, recordRun } = useProgress();
  const [route, setRoute] = useState<Route>({ name: "home" });
  const [runCounter, setRunCounter] = useState(0);

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
          onFinish={(result) => {
            const xpBefore = state.xp;
            const prevRecords = state.records ?? {};
            const next = recordRun(result);
            setRoute({ name: "result", lessonId: ref.meta.id, result, xpBefore, xpAfter: next.xp, prevRecords });
          }}
        />
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

  return <HomeScreen onStart={start} onPuzzles={() => setRoute({ name: "trainer" })} />;
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
    <ProgressProvider>
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
