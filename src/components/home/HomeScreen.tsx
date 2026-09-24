import { useState, type FC } from "react";
import { CURRICULUM, ALL_LESSONS, type LessonRef } from "@/content/curriculum";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatsHeader } from "@/components/home/StatsHeader";
import { ContinueCard } from "@/components/home/ContinueCard";
import { PuzzleCard } from "@/components/home/PuzzleCard";
import { ModuleSection } from "@/components/home/ModuleSection";
import { useProgress } from "@/lib/progress/ProgressContext";
import { isCompleted, nextLesson } from "@/lib/progress/availability";

const SOURCES = [
  { label: "Leis do Xadrez da FIDE (tradução oficial em português)", href: "https://arbiters.fide.com/wp-content/uploads/Publications/VariousContributions/20230101-FIDE_Laws_2023-POR.pdf" },
  { label: "Xadrez e Educação Física, e-book do CAp-UERJ (CC BY 4.0)", href: "https://www.ppgeb.cap.uerj.br/wp-content/uploads/2021/08/2020Matheus-eBook-Xadrez.pdf" },
  { label: "Lichess Learn e Practice (ordem dos temas)", href: "https://lichess.org/practice" },
  { label: "Chess Fundamentals, Capablanca (domínio público)", href: "https://www.gutenberg.org/ebooks/33870" },
  { label: "Banco de puzzles do Lichess (CC0), para as táticas", href: "https://database.lichess.org/#puzzles" },
  { label: "Nomes de aberturas do Lichess (CC0)", href: "https://github.com/lichess-org/chess-openings" },
];

export const HomeScreen: FC<{ onStart: (ref: LessonRef) => void; onPuzzles: () => void }> = ({ onStart, onPuzzles }) => {
  const { state, reset } = useProgress();
  const [confirmReset, setConfirmReset] = useState(false);
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

      <footer className="flex flex-col gap-3 pt-2 text-sm text-muted-foreground">
        <div>
          <h2 className="pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em]">Fontes do conteúdo</h2>
          <ul className="flex flex-col gap-1">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:text-foreground">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <Button variant="ghost" size="sm" className="self-start px-0 text-muted-foreground hover:bg-transparent hover:text-danger" onClick={() => setConfirmReset(true)}>
          Zerar progresso
        </Button>
      </footer>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="max-w-[22rem] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Zerar todo o progresso?</DialogTitle>
            <DialogDescription>XP, estrelas, sequência de dias e lições concluídas voltam a zero. Não dá para desfazer.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button variant="ghost" className="h-11 w-full rounded-xl" onClick={() => setConfirmReset(false)}>
              Cancelar
            </Button>
            <Button
              className="h-11 w-full rounded-xl bg-danger font-bold text-destructive-foreground hover:bg-danger/90"
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
            >
              Zerar progresso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
