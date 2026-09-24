import { useState, type FC } from "react";
import { findLesson, lessonCode, type LessonRef } from "@/content/curriculum";
import type { LessonRunResult } from "@/lib/progress/types";
import { ProgressProvider, useProgress } from "@/lib/progress/ProgressContext";
import { followingLesson } from "@/lib/progress/availability";
import { HomeScreen } from "@/components/home/HomeScreen";
import { LessonPlayer } from "@/components/lesson/LessonPlayer";
import { ResultScreen } from "@/components/result/ResultScreen";
import { PuzzleTrainer } from "@/components/trainer/PuzzleTrainer";

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

const App: FC = () => (
  <ProgressProvider>
    <Shell />
  </ProgressProvider>
);

export default App;
