import { useState, type FC } from "react";
import { Check, ChevronDown, Clock, Play, RotateCcw } from "lucide-react";
import { ALL_LESSONS, lessonCode, type LessonRef } from "@/content/curriculum";
import type { ModuleDef } from "@/content/types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StarRating } from "@/components/common/StarRating";
import { useProgress } from "@/lib/progress/ProgressContext";
import { lessonStatus, type LessonStatus } from "@/lib/progress/availability";
import { cn } from "@/lib/utils";

interface ModuleSectionProps {
  module: ModuleDef;
  defaultOpen?: boolean;
  onStart: (ref: LessonRef) => void;
}

const STATUS_ICON: Record<LessonStatus, FC<{ className?: string }>> = {
  done: Check,
  next: Play,
  available: Play,
  soon: Clock,
};

export const ModuleSection: FC<ModuleSectionProps> = ({ module, defaultOpen = false, onStart }) => {
  const { state } = useProgress();
  const [open, setOpen] = useState(defaultOpen);
  const refs = ALL_LESSONS.filter((r) => r.module.id === module.id);
  const done = refs.filter((r) => lessonStatus(state, r) === "done").length;
  const ready = refs.filter((r) => r.meta.lesson).length;
  const pct = Math.round((done / refs.length) * 100);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b last:border-b-0">
      <CollapsibleTrigger className="flex w-full items-center gap-3 py-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg font-mono text-sm font-bold",
            done === refs.length ? "bg-success text-success-foreground" : ready > 0 ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
          )}
        >
          {String(module.number).padStart(2, "0")}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate font-display text-[1.05rem] font-bold">{module.title}</span>
            <span className="shrink-0 font-mono text-xs font-semibold tabular text-muted-foreground">
              {done}/{refs.length}
            </span>
          </span>
          <span className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
            <span className="block h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <p className="pb-2 pl-[3.25rem] text-sm text-muted-foreground">{module.description}</p>
        <ul className="flex flex-col gap-1 pb-3 pl-[3.25rem]">
          {refs.map((ref) => (
            <LessonRow key={ref.meta.id} lessonRef={ref} status={lessonStatus(state, ref)} stars={state.lessons[ref.meta.id]?.bestStars ?? 0} onStart={onStart} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};

interface LessonRowProps {
  lessonRef: LessonRef;
  status: LessonStatus;
  stars: number;
  onStart: (ref: LessonRef) => void;
}

const LessonRow: FC<LessonRowProps> = ({ lessonRef, status, stars, onStart }) => {
  const Icon = STATUS_ICON[status];
  const playable = status !== "soon";
  return (
    <li>
      <button
        type="button"
        disabled={!playable}
        onClick={() => onStart(lessonRef)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition-colors",
          playable ? "hover:bg-accent active:bg-accent" : "cursor-default",
          status === "next" && "border-primary/40 bg-primary/5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full",
            status === "done" && "bg-success-soft text-success",
            status === "next" && "bg-primary text-primary-foreground",
            status === "available" && "bg-primary/10 text-primary",
            status === "soon" && "bg-secondary text-muted-foreground",
          )}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate text-[15px] font-semibold", !playable && "text-muted-foreground")}>
            <span className="mr-1.5 font-mono text-xs font-bold text-muted-foreground">{lessonCode(lessonRef)}</span>
            {lessonRef.meta.title}
          </span>
          {status === "soon" && <span className="text-xs text-muted-foreground">Em breve</span>}
          {status === "next" && <span className="text-xs text-primary">Próxima sugerida</span>}
          {status === "available" && <span className="text-xs text-muted-foreground">Ainda não feita</span>}
          {status === "done" && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <StarRating value={stars} />
              <span className="inline-flex items-center gap-1">
                <RotateCcw className="h-3 w-3" aria-hidden /> Praticar de novo
              </span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
};
