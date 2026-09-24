import type { FC, ReactNode } from "react";

interface StepLayoutProps {
  children: ReactNode;
  footer: ReactNode;
  /** Expected answer, exposed for automated walkthrough tests. */
  solution?: unknown;
}

/** Scrollable step content with a feedback bar pinned to the bottom. */
export const StepLayout: FC<StepLayoutProps> = ({ children, footer, solution }) => (
  <>
    <main className="min-h-0 flex-1 overflow-y-auto" data-solution={solution === undefined ? undefined : JSON.stringify(solution)}>
      <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-4 px-4 pb-6 pt-2 animate-in fade-in slide-in-from-right-3 duration-300">
        {children}
      </div>
    </main>
    {footer}
  </>
);

export const StepPrompt: FC<{ eyebrow?: string; children: ReactNode }> = ({ eyebrow, children }) => (
  <div className="flex flex-col gap-1">
    {eyebrow && (
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>
    )}
    <h2 className="font-display text-[1.35rem] font-bold leading-tight tracking-tight">{children}</h2>
  </div>
);
