import { useEffect, type FC } from "react";
import { playSound } from "@/lib/sound";
import { Home, RotateCcw, Sparkles } from "lucide-react";
import { lessonCode, type LessonRef } from "@/content/curriculum";
import type { LessonRunResult } from "@/lib/progress/types";
import { levelProgress, pctOf, starsFor } from "@/lib/progress/scoring";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/common/StarRating";
import { RichText } from "@/components/common/RichText";
import { NextLessonButton } from "@/components/result/NextLessonButton";

interface ResultScreenProps {
  lessonRef: LessonRef;
  result: LessonRunResult;
  xpBefore: number;
  xpAfter: number;
  prevRecords: Record<string, number>;
  next: LessonRef | null;
  onNext: (ref: LessonRef) => void;
  onRetry: () => void;
  onHome: () => void;
}

const HEADLINE = ["", "Lição concluída", "Muito bem", "Perfeito"];

export const ResultScreen: FC<ResultScreenProps> = ({ lessonRef, result, xpBefore, xpAfter, prevRecords, next, onNext, onRetry, onHome }) => {
  const pct = pctOf(result);
  const stars = starsFor(pct);
  const before = levelProgress(xpBefore);
  const after = levelProgress(xpAfter);
  const leveledUp = after.level > before.level;
  const uniqueMistakes = [...new Set(result.mistakes)];
  useEffect(() => {
    playSound("complete");
  }, []);

  return (
    <div className="flex h-full flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-5 px-4 pb-6 pt-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <StarRating value={stars} size="lg" animate />
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                <span className="font-mono">{lessonCode(lessonRef)}</span> · {lessonRef.meta.title}
              </p>
              <h1 className="font-display text-[1.9rem] font-extrabold leading-tight tracking-tight">{HEADLINE[stars]}</h1>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-2">
            <Stat label="XP ganho" value={`+${result.points}`} tone="gold" />
            <Stat label="Aproveitamento" value={`${pct}%`} />
            <Stat label="De primeira" value={`${result.firstTry}/${result.exercises}`} />
          </dl>

          <div className="flex flex-col gap-2 rounded-xl border bg-card px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-bold">
                Nível {after.level} · {after.title}
              </span>
              <span className="font-mono text-xs font-semibold tabular text-muted-foreground">
                {after.intoLevel}/{after.levelSize} XP
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="h-full rounded-full bg-gold transition-[width] duration-1000 ease-out" style={{ width: `${after.pct}%` }} />
            </div>
            {leveledUp && (
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gold animate-in fade-in zoom-in-95 duration-500">
                <Sparkles className="h-4 w-4" aria-hidden /> Você subiu para o nível {after.level}!
              </p>
            )}
          </div>

          {result.records && result.records.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Recordes</h2>
              <ul className="flex flex-col gap-1.5">
                {result.records.map((r) => {
                  const prev = prevRecords[r.key] ?? 0;
                  const isNew = r.value > prev;
                  return (
                    <li key={r.key} className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-[15px]">
                      <span>
                        {r.label.charAt(0).toUpperCase() + r.label.slice(1)}: <span className="font-mono font-bold tabular">{r.value}</span> casas
                      </span>
                      {isNew ? (
                        <span className="rounded-full bg-gold-soft px-2 py-0.5 text-xs font-bold text-gold">Novo recorde</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Recorde: <span className="font-mono tabular">{prev}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Para revisar</h2>
            {uniqueMistakes.length === 0 ? (
              <p className="text-[15px]">Nenhum erro nesta rodada.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {uniqueMistakes.slice(0, 8).map((m) => (
                  <li key={m} className="rounded-lg bg-danger-soft px-2.5 py-1 text-sm">
                    <RichText text={m} />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted-foreground">Cada vez que você refaz a lição, os exemplos mudam.</p>
          </section>
        </div>
      </main>

      <div className="border-t bg-card px-4 pt-3 pb-safe">
        <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-2">
          {next && <NextLessonButton next={next} onNext={onNext} />}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11 rounded-xl font-semibold" onClick={onRetry}>
              <RotateCcw className="!h-4 !w-4" /> Praticar de novo
            </Button>
            <Button variant="outline" className="h-11 rounded-xl font-semibold" onClick={onHome}>
              <Home className="!h-4 !w-4" /> Início
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Stat: FC<{ label: string; value: string; tone?: "gold" }> = ({ label, value, tone }) => (
  <div className="flex flex-col items-center gap-0.5 rounded-xl border bg-card px-2 py-3 text-center">
    <dd className={tone === "gold" ? "font-mono text-xl font-bold tabular text-gold" : "font-mono text-xl font-bold tabular"}>{value}</dd>
    <dt className="text-[11px] leading-tight text-muted-foreground">{label}</dt>
  </div>
);
