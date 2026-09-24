import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { playSound } from "@/lib/sound";
import { Timer } from "lucide-react";
import type { DrillScreen, MarkKind } from "@/content/types";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";
import { pick } from "@/lib/random";
import { useProgress } from "@/lib/progress/ProgressContext";
import { Board } from "@/components/board/Board";
import { CoordChip } from "@/components/common/CoordChip";
import { RichText } from "@/components/common/RichText";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";

type Phase = "ready" | "running" | "over";

function nextTarget(prev?: Square): Square {
  let sq = pick(ALL_SQUARES);
  while (sq === prev) sq = pick(ALL_SQUARES);
  return sq;
}

export const DrillStep: FC<{ screen: DrillScreen; onDone: StepDone }> = ({ screen, onDone }) => {
  const { state } = useProgress();
  const previousRecord = state.records?.[screen.key] ?? 0;
  const [phase, setPhase] = useState<Phase>("ready");
  const [target, setTarget] = useState<Square>(() => nextTarget());
  const [hits, setHits] = useState(0);
  const [misses, setMisses] = useState(0);
  const [flash, setFlash] = useState<{ sq: Square; kind: MarkKind } | null>(null);
  // Automated tests can shorten the clock.
  const durationSec = (window as unknown as { __FAST_DRILL?: boolean }).__FAST_DRILL ? 3 : screen.durationSec;
  const [left, setLeft] = useState(durationSec * 1000);
  const timer = useRef<number | undefined>(undefined);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearInterval(timer.current);
      window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const start = useCallback(() => {
    setPhase("running");
    const endAt = performance.now() + durationSec * 1000;
    timer.current = window.setInterval(() => {
      const remaining = Math.max(0, endAt - performance.now());
      setLeft(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer.current);
        playSound("correct");
        setPhase("over");
      }
    }, 100);
  }, [durationSec]);

  const handleTap = (sq: Square) => {
    if (phase !== "running") return;
    window.clearTimeout(flashTimer.current);
    if (sq === target) {
      setHits((h) => h + 1);
      playSound("tick");
      setFlash({ sq, kind: "good" });
      setTarget(nextTarget(sq));
    } else {
      setMisses((m) => m + 1);
      playSound("wrong");
      setFlash({ sq, kind: "bad" });
    }
    flashTimer.current = window.setTimeout(() => setFlash(null), 350);
  };

  const overlay = useMemo(() => (flash ? { [flash.sq]: flash.kind } : undefined), [flash]);
  const points = Math.round((10 * Math.min(hits, screen.target)) / screen.target);
  const isRecord = phase === "over" && hits > previousRecord;
  const pctLeft = (left / (durationSec * 1000)) * 100;

  let footer;
  if (phase === "ready") {
    footer = <FeedbackBar tone="neutral" message={`Meta: ${screen.target} casas. Seu recorde: ${previousRecord}.`} actionLabel="Começar" onAction={start} />;
  } else if (phase === "running") {
    footer = <FeedbackBar tone="neutral" message={`Acertos: ${hits}${misses ? ` · erros: ${misses}` : ""}`} />;
  } else {
    footer = (
      <FeedbackBar
        tone={hits >= screen.target ? "correct" : "partial"}
        title={`${hits} ${hits === 1 ? "casa" : "casas"}! +${points} XP`}
        message={
          isRecord
            ? `Novo recorde ${screen.recordLabel}. O anterior era ${previousRecord}.`
            : `Seu recorde ${screen.recordLabel} continua ${previousRecord}. Meta: ${screen.target}.`
        }
        actionLabel="Continuar"
        onAction={() =>
          onDone({
            key: screen.key,
            points,
            max: 10,
            firstTry: hits >= screen.target,
            mistakeNote: hits < screen.target ? `Desafio ${screen.title.toLowerCase()}: ${hits} de ${screen.target}` : undefined,
            record: { key: screen.key, value: hits, label: screen.recordLabel },
          })
        }
      />
    );
  }

  return (
    <StepLayout footer={footer} solution={{ drill: true }}>
      <StepPrompt eyebrow="Desafio">{screen.title}</StepPrompt>
      {phase === "ready" ? (
        <p className="text-[17px] leading-relaxed text-foreground/90">
          <RichText text={screen.intro} />
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xl font-bold">
            {phase === "running" ? (
              <>
                Toque em <CoordChip value={target} className="text-2xl" data-drill-target={target} />
              </>
            ) : (
              <span>Tempo esgotado</span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 font-mono text-lg font-bold tabular" aria-label={`${Math.ceil(left / 1000)} segundos`}>
            <Timer className="h-5 w-5 text-muted-foreground" aria-hidden />
            {Math.ceil(left / 1000)}s
          </div>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pctLeft}%` }} />
      </div>
      <Board spec={{ orientation: screen.orientation }} overlay={overlay} onSquareTap={phase === "running" ? handleTap : undefined} />
    </StepLayout>
  );
};
