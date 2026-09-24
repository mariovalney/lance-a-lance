import { useState, type FC } from "react";
import { playSound } from "@/lib/sound";
import { EyeOff } from "lucide-react";
import type { ChoiceScreen } from "@/content/types";
import { Board } from "@/components/board/Board";
import { RichText } from "@/components/common/RichText";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";
import { cn } from "@/lib/utils";

export const ChoiceStep: FC<{ screen: ChoiceScreen; onDone: StepDone }> = ({ screen, onDone }) => {
  const [chosen, setChosen] = useState<string | null>(null);
  const answered = chosen !== null;
  const correct = chosen === screen.correct;

  const board = answered ? (screen.revealBoard ?? screen.board) : screen.hideBoardUntilAnswered ? undefined : screen.board;

  const finish = () =>
    onDone({
      key: screen.key,
      points: correct ? 10 : 0,
      max: 10,
      firstTry: correct,
      mistakeNote: correct ? undefined : screen.mistakeNote,
    });

  const footer = answered ? (
    <FeedbackBar
      tone={correct ? "correct" : "wrong"}
      title={correct ? "Certo! +10 XP" : "Não foi dessa vez"}
      message={screen.explain}
      actionLabel="Continuar"
      onAction={finish}
    />
  ) : (
    <FeedbackBar tone="neutral" message="Escolha uma resposta." />
  );

  const longest = Math.max(...screen.options.map((o) => o.label.length));
  const cols = longest > 12 ? "grid-cols-1" : screen.options.length === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <StepLayout footer={footer} solution={{ choose: screen.correct }}>
      <StepPrompt eyebrow="Pratique">
        <RichText text={screen.prompt} />
      </StepPrompt>

      {board ? (
        <Board spec={board} />
      ) : !screen.hideBoardUntilAnswered || answered ? null : (
        <div className="flex aspect-[2/1] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card text-center text-sm text-muted-foreground">
          <EyeOff className="h-5 w-5" aria-hidden />
          <p className="max-w-[16rem]">Responda de cabeça. O tabuleiro aparece depois.</p>
        </div>
      )}

      <div className={cn("grid gap-2.5", cols)} role="group" aria-label="Respostas">
        {screen.options.map((opt) => {
          const isChosen = chosen === opt.id;
          const isRight = opt.id === screen.correct;
          const state = !answered ? "idle" : isRight ? "right" : isChosen ? "wrong" : "dim";
          return (
            <button
              key={opt.id}
              type="button"
              data-option-id={opt.id}
              disabled={answered}
              onClick={() => {
                setChosen(opt.id);
                playSound(opt.id === screen.correct ? "correct" : "wrong");
              }}
              className={cn(
                cn("rounded-xl border-2 px-3 text-base font-semibold transition-all", longest > 12 ? "h-12" : "h-14"),
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                opt.mono && "font-mono text-lg",
                state === "idle" && "border-border bg-card shadow-[0_2px_0_hsl(var(--border))] active:translate-y-[2px] active:shadow-none",
                state === "right" && "border-success bg-success-soft text-success",
                state === "wrong" && "border-danger bg-danger-soft text-danger animate-shake",
                state === "dim" && "border-border bg-card opacity-45",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </StepLayout>
  );
};
