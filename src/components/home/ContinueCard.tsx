import type { FC } from "react";
import { ArrowRight, Clock, RotateCcw } from "lucide-react";
import { lessonCode, type LessonRef } from "@/content/curriculum";
import { Button } from "@/components/ui/button";
import { MiniBoard } from "@/components/common/MiniBoard";
import { useProgress } from "@/lib/progress/useProgress";
import { nextLesson, weakestLesson } from "@/lib/progress/availability";

interface ContinueCardProps {
  onStart: (ref: LessonRef) => void;
}

export const ContinueCard: FC<ContinueCardProps> = ({ onStart }) => {
  const { state } = useProgress();
  const next = nextLesson(state);
  const practice = next ? null : weakestLesson(state);
  const target = next ?? practice;
  if (!target) return null;

  const isFirst = Object.keys(state.lessons).length === 0;
  const eyebrow = next ? (isFirst ? "Comece por aqui" : "Próxima lição") : "Tudo em dia. Que tal praticar?";

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-primary p-4 text-primary-foreground shadow-[0_10px_30px_-14px_hsl(var(--primary))]"
      aria-label="Continuar estudando"
    >
      <div className="flex gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-80">{eyebrow}</p>
          <p className="text-sm font-medium opacity-85">
            <span className="font-mono">{lessonCode(target)}</span> · Módulo {target.module.number}, {target.module.title}
          </p>
          <h2 className="font-display text-[1.45rem] font-bold leading-tight">{target.meta.title}</h2>
          <p className="text-[15px] leading-snug opacity-90">{target.meta.summary}</p>
        </div>
        <MiniBoard highlight={["e4", "c6"]} className="h-20 w-20 shrink-0 self-start opacity-95 ring-2 ring-primary-foreground/25" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm opacity-85">
          <Clock className="h-4 w-4" aria-hidden />
          {target.meta.lesson?.minutes ?? 3} min
        </span>
        <Button
          onClick={() => onStart(target)}
          className="h-11 rounded-xl bg-primary-foreground px-5 text-base font-bold text-primary shadow-none hover:bg-primary-foreground/90"
        >
          {next ? (
            <>
              Começar <ArrowRight className="!h-4 !w-4" />
            </>
          ) : (
            <>
              <RotateCcw className="!h-4 !w-4" /> Praticar
            </>
          )}
        </Button>
      </div>
    </section>
  );
};
