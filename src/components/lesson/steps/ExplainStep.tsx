import type { FC } from "react";
import { Lightbulb } from "lucide-react";
import type { ExplainScreen } from "@/content/types";
import { Board } from "@/components/board/Board";
import { RichText } from "@/components/common/RichText";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";

export const ExplainStep: FC<{ screen: ExplainScreen; onDone: StepDone }> = ({ screen, onDone }) => (
  <StepLayout solution={{ continue: true }} footer={<FeedbackBar tone="neutral" actionLabel="Continuar" onAction={() => onDone(null)} />}>
    <StepPrompt eyebrow="Conceito">{screen.title}</StepPrompt>
    <p className="text-[17px] leading-relaxed text-foreground/90">
      <RichText text={screen.text} />
    </p>
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
    {screen.tip && (
      <div className="flex gap-2.5 rounded-xl bg-gold-soft px-3.5 py-3 text-[15px] leading-snug">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
        <RichText text={screen.tip} />
      </div>
    )}
  </StepLayout>
);
