import { useMemo, useState, type FC } from "react";
import { X } from "lucide-react";
import type { LessonDef, Screen } from "@/content/types";
import { isExercise } from "@/content/types";
import type { LessonRunResult } from "@/lib/progress/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExplainStep } from "@/components/lesson/steps/ExplainStep";
import { TapStep } from "@/components/lesson/steps/TapStep";
import { TapAllStep } from "@/components/lesson/steps/TapAllStep";
import { ChoiceStep } from "@/components/lesson/steps/ChoiceStep";
import { DrillStep } from "@/components/lesson/steps/DrillStep";
import { MoveStep } from "@/components/lesson/steps/MoveStep";
import { PathStep } from "@/components/lesson/steps/PathStep";
import { SequenceStep } from "@/components/lesson/steps/SequenceStep";
import { PlayStep } from "@/components/lesson/steps/PlayStep";
import type { ExerciseResult } from "@/components/lesson/types";

interface LessonPlayerProps {
  lesson: LessonDef;
  code: string;
  onExit: () => void;
  onFinish: (result: LessonRunResult) => void;
}

function renderStep(screen: Screen, onDone: (r: ExerciseResult | null) => void) {
  switch (screen.kind) {
    case "explain":
      return <ExplainStep screen={screen} onDone={onDone} />;
    case "tap":
      return <TapStep screen={screen} onDone={onDone} />;
    case "tapAll":
      return <TapAllStep screen={screen} onDone={onDone} />;
    case "choice":
      return <ChoiceStep screen={screen} onDone={onDone} />;
    case "drill":
      return <DrillStep screen={screen} onDone={onDone} />;
    case "move":
      return <MoveStep screen={screen} onDone={onDone} />;
    case "path":
      return <PathStep screen={screen} onDone={onDone} />;
    case "sequence":
      return <SequenceStep screen={screen} onDone={onDone} />;
    case "play":
      return <PlayStep screen={screen} onDone={onDone} />;
  }
}

export const LessonPlayer: FC<LessonPlayerProps> = ({ lesson, code, onExit, onFinish }) => {
  // A fresh set of examples every time the lesson is opened.
  const screens = useMemo(() => lesson.build(), [lesson]);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<ExerciseResult[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);

  const exerciseCount = screens.filter(isExercise).length;
  const points = results.reduce((s, r) => s + r.points, 0);
  const progressPct = Math.round((index / screens.length) * 100);

  const handleDone = (result: ExerciseResult | null) => {
    const nextResults = result ? [...results, result] : results;
    setResults(nextResults);
    if (index + 1 < screens.length) {
      setIndex(index + 1);
      return;
    }
    onFinish({
      lessonId: lesson.id,
      points: nextResults.reduce((s, r) => s + r.points, 0),
      maxPoints: nextResults.reduce((s, r) => s + r.max, 0),
      exercises: exerciseCount,
      firstTry: nextResults.filter((r) => r.firstTry).length,
      mistakes: nextResults.filter((r) => r.mistakeNote).map((r) => r.mistakeNote!),
      records: nextResults.filter((r) => r.record).map((r) => r.record!),
    });
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="mx-auto flex w-full max-w-[30rem] items-center gap-3 px-2 pb-2 pt-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full"
          onClick={() => (index === 0 && results.length === 0 ? onExit() : setConfirmExit(true))}
          aria-label="Sair da lição"
        >
          <X className="!h-5 !w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate font-semibold text-muted-foreground">
              <span className="font-mono">{code}</span> · {lesson.title}
            </span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
            aria-label="Progresso da lição"
          >
            <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <div className="shrink-0 rounded-full bg-gold-soft px-2.5 py-1 font-mono text-sm font-bold tabular text-gold" aria-label={`${points} XP nesta lição`}>
          {points} XP
        </div>
      </header>

      <div key={index} className="flex min-h-0 flex-1 flex-col">
        {renderStep(screens[index], handleDone)}
      </div>

      <Dialog open={confirmExit} onOpenChange={setConfirmExit}>
        <DialogContent className="max-w-[22rem] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Sair da lição?</DialogTitle>
            <DialogDescription>O que você fez nesta lição não será salvo. Da próxima vez ela começa com exemplos novos.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button className="h-11 w-full rounded-xl font-bold" onClick={() => setConfirmExit(false)}>
              Continuar a lição
            </Button>
            <Button variant="ghost" className="h-11 w-full rounded-xl text-danger hover:text-danger" onClick={onExit}>
              Sair sem salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
