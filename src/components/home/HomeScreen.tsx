import type { FC } from "react";
import { CURRICULUM, ALL_LESSONS, type LessonRef } from "@/content/curriculum";
import { StatsHeader } from "@/components/home/StatsHeader";
import { ContinueCard } from "@/components/home/ContinueCard";
import { PuzzleCard } from "@/components/home/PuzzleCard";
import { ModuleSection } from "@/components/home/ModuleSection";
import { useProgress } from "@/lib/progress/useProgress";
import { isCompleted, nextLesson } from "@/lib/progress/availability";

export const HomeScreen: FC<{ onStart: (ref: LessonRef) => void; onPuzzles: () => void }> = ({ onStart, onPuzzles }) => {
  const { state } = useProgress();
  const current = nextLesson(state);
  const openModule = current?.module.id ?? CURRICULUM[0].id;
  const doneCount = ALL_LESSONS.filter((r) => isCompleted(state, r.meta.id)).length;

  return (
    <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-5 px-4 pb-10">
      <StatsHeader />
      <ContinueCard onStart={onStart} />
      <PuzzleCard onOpen={onPuzzles} />

      <section aria-labelledby="trilha" className="flex flex-col">
        <div className="flex items-baseline justify-between pb-1">
          <h2 id="trilha" className="font-display text-lg font-bold">
            Trilha
          </h2>
          <span className="text-xs text-muted-foreground">
            <span className="font-mono font-semibold tabular">{doneCount}</span> de{" "}
            <span className="font-mono font-semibold tabular">{ALL_LESSONS.length}</span> lições
          </span>
        </div>
        <div className="rounded-2xl border bg-card px-3">
          {CURRICULUM.map((m) => (
            <ModuleSection key={m.id} module={m} defaultOpen={m.id === openModule} onStart={onStart} />
          ))}
        </div>
      </section>
    </div>
  );
};
