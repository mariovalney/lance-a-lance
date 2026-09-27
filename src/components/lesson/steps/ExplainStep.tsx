import type { FC } from "react";
import type { ExplainScreen } from "@/content/types";
import { ExplainBody } from "@/components/lesson/ExplainBody";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";

export const ExplainStep: FC<{ screen: ExplainScreen; onDone: StepDone }> = ({ screen, onDone }) => (
  <StepLayout solution={{ continue: true }} footer={<FeedbackBar tone="neutral" actionLabel="Continuar" onAction={() => onDone(null)} />}>
    <StepPrompt eyebrow="Conceito">{screen.title}</StepPrompt>
    <ExplainBody screen={screen} />
  </StepLayout>
);
