import { useEffect, useMemo, useState, type FC } from "react";
import { ChevronLeft, ChevronRight, Lightbulb, RotateCcw } from "lucide-react";
import type { DemoFrame, ExplainScreen } from "@/content/types";
import { Board } from "@/components/board/Board";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/common/RichText";
import { load, playDemoMove } from "@/lib/chess/game";
import type { Square } from "@/lib/chess/squares";

/** How long a demonstration waits before a step's first move, and between its moves. */
const FIRST_MOVE_MS = 450;
const NEXT_MOVE_MS = 750;

/** Where each step of a demonstration starts: its own position, or the one the steps before it left. */
function stepStarts(fen: string, demo: DemoFrame[]): string[] {
  let game = load(fen);
  return demo.map((frame) => {
    if (frame.fen) game = load(frame.fen);
    const start = game.fen();
    for (const uci of frame.moves ?? []) playDemoMove(game, uci);
    return start;
  });
}

/**
 * One step of a demonstration on the board: its moves played one by one from
 * where it starts, then its arrows, marks and area. Mounted afresh for every
 * step, so going back plays the step again.
 */
const DemoStep: FC<{ screen: ExplainScreen; start: string; frame: DemoFrame }> = ({ screen, start, frame }) => {
  const [shown, setShown] = useState<{ fen: string; lastMove: [Square, Square] | null; played: number }>({ fen: start, lastMove: null, played: 0 });
  const done = shown.played >= (frame.moves?.length ?? 0);

  useEffect(() => {
    const game = load(start);
    const timers = (frame.moves ?? []).map((uci, i) =>
      window.setTimeout(() => {
        const move = playDemoMove(game, uci);
        setShown({ fen: game.fen(), lastMove: [move.from as Square, move.to as Square], played: i + 1 });
      }, FIRST_MOVE_MS + i * NEXT_MOVE_MS),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [start, frame]);

  return (
    <div data-demo-done={done || undefined}>
      <Board
        spec={{
          ...screen.board,
          fen: shown.fen,
          // Once the area is drawn it is the point; the last move would only blur it.
          lastMove: done && frame.area ? undefined : (shown.lastMove ?? undefined),
          arrows: done ? frame.arrows : undefined,
          marks: done ? frame.marks : undefined,
          area: done ? frame.area : undefined,
          labels: done && frame.labels ? frame.labels : screen.board?.labels,
        }}
        ariaLabel={`Exemplo: ${screen.title}`}
      />
    </div>
  );
};

/**
 * The board of an explain screen played out step by step: one step at a time
 * under the board, and choosing a step plays it.
 */
const Demo: FC<{ screen: ExplainScreen; demo: DemoFrame[]; steps: string[] }> = ({ screen, demo, steps }) => {
  const [step, setStep] = useState(0);
  const [round, setRound] = useState(0);
  const starts = useMemo(() => stepStarts(screen.board?.fen ?? "", demo), [screen.board?.fen, demo]);
  const last = step === demo.length - 1;
  return (
    <>
      <DemoStep key={`${round}:${step}`} screen={screen} start={starts[step]} frame={demo[step]} />
      <div className="flex flex-col gap-2 rounded-xl border bg-card px-3 py-2.5" data-demo-step={step}>
        <div className="flex gap-3 text-[15px] leading-snug">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">{step + 1}</span>
          <RichText text={steps[step]} />
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Passo anterior" disabled={step === 0} onClick={() => setStep(step - 1)}>
            <ChevronLeft className="!h-5 !w-5" />
          </Button>
          <span className="font-mono text-xs tabular text-muted-foreground">
            {step + 1} de {demo.length}
          </span>
          {last ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              aria-label="Ver de novo"
              onClick={() => {
                setStep(0);
                setRound((n) => n + 1);
              }}
            >
              <RotateCcw className="!h-4 !w-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" aria-label="Próximo passo" onClick={() => setStep(step + 1)}>
              <ChevronRight className="!h-5 !w-5" />
            </Button>
          )}
        </div>
      </div>
    </>
  );
};

/**
 * What an explain screen teaches: its text, numbered steps, board and tip, or
 * its steps played out on the board. The lesson's hint shows it again.
 */
export const ExplainBody: FC<{ screen: ExplainScreen }> = ({ screen }) => (
  <>
    <p className="text-[17px] leading-relaxed text-foreground/90">
      <RichText text={screen.text} />
    </p>
    {screen.demo && screen.steps && screen.board ? (
      <Demo screen={screen} demo={screen.demo} steps={screen.steps} />
    ) : (
      <>
        {screen.steps && (
          <ol className="flex flex-col gap-2">
            {screen.steps.map((step, i) => (
              <li key={i} className="flex gap-3 rounded-xl border bg-card px-3 py-2.5 text-[15px] leading-snug">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <RichText text={step} />
              </li>
            ))}
          </ol>
        )}
        {screen.board && <Board spec={screen.board} ariaLabel={`Exemplo: ${screen.title}`} />}
      </>
    )}
    {screen.tip && (
      <div className="flex gap-2.5 rounded-xl bg-gold-soft px-3.5 py-3 text-[15px] leading-snug">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
        <RichText text={screen.tip} />
      </div>
    )}
  </>
);
