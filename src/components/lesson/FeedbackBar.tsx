import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import { CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/common/RichText";
import { cn } from "@/lib/utils";

export type FeedbackTone = "neutral" | "wrong" | "correct" | "partial";

interface FeedbackBarProps {
  tone: FeedbackTone;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  extra?: ReactNode;
  /** Correct answers continue on their own after a short countdown. Default true. */
  autoAdvance?: boolean;
  /** Wrong-answer banners without an action close themselves and call this. */
  onDismiss?: () => void;
}

export const WRONG_BANNER_MS = 2500;

export const AUTO_STEP_MS = 1500;

const TONE_STYLE: Record<FeedbackTone, string> = {
  neutral: "bg-card",
  wrong: "bg-danger-soft",
  correct: "bg-success-soft",
  partial: "bg-gold-soft",
};

const TONE_TEXT: Record<FeedbackTone, string> = {
  neutral: "text-foreground",
  wrong: "text-danger",
  correct: "text-success",
  partial: "text-gold",
};

const TONE_BUTTON: Record<FeedbackTone, string> = {
  neutral: "bg-primary text-primary-foreground hover:bg-primary/90",
  wrong: "bg-danger text-destructive-foreground hover:bg-danger/90",
  correct: "bg-success text-success-foreground hover:bg-success/90",
  partial: "bg-gold text-[#1c1405] hover:bg-gold/90",
};

const CountdownAction: FC<{ label: string; className: string; onAction: () => void; onPause: () => void }> = ({
  label,
  className,
  onAction: act,
  onPause,
}) => {
  const fired = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Touching anywhere else on the screen pauses the countdown.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (buttonRef.current && e.target instanceof Node && buttonRef.current.contains(e.target)) return;
      onPause();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onPause]);
  const onAction = () => {
    if (fired.current) return;
    fired.current = true;
    act();
  };
  const { progress, secondsLeft } = useCountdown(AUTO_STEP_MS, onAction);
  return (
    <Button
      ref={buttonRef}
      size="lg"
      className={cn("relative h-12 w-full overflow-hidden rounded-xl text-base font-bold shadow-none", className)}
      onClick={onAction}
      autoFocus
    >
      <span className="pointer-events-none absolute inset-y-0 left-0 bg-white/25" style={{ width: `${progress * 100}%` }} aria-hidden />
      <span className="relative">{label}</span>
      <span className="relative rounded-md bg-black/10 px-1.5 font-mono text-sm tabular" aria-hidden>
        {secondsLeft}s
      </span>
    </Button>
  );
};

export const FeedbackBar: FC<FeedbackBarProps> = ({ tone, title, message, actionLabel, onAction, extra, autoAdvance = true, onDismiss }) => {
  const Icon = tone === "correct" ? CheckCircle2 : tone === "wrong" ? XCircle : tone === "partial" ? Lightbulb : null;
  const [paused, setPaused] = useState(false);
  const auto = autoAdvance && !paused && (tone === "correct" || tone === "partial") && Boolean(actionLabel && onAction);
  const pause = useCallback(() => setPaused(true), []);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const selfClosing = tone === "wrong" && !actionLabel && Boolean(onDismiss);
  useEffect(() => {
    if (!selfClosing) return;
    const id = window.setTimeout(() => dismissRef.current?.(), WRONG_BANNER_MS);
    return () => window.clearTimeout(id);
  }, [selfClosing, message, title]);
  return (
    <div
      className={cn("border-t px-4 pt-3 transition-colors duration-200 pb-safe", TONE_STYLE[tone])}
      role={tone === "neutral" ? undefined : "status"}
      aria-live="polite"
    >
      <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-3">
        {(title || message) && (
          <div className={cn("flex gap-2.5", tone !== "neutral" && "animate-in fade-in slide-in-from-bottom-1 duration-200")}>
            {Icon && <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", TONE_TEXT[tone])} aria-hidden />}
            <div className="min-w-0 text-[15px] leading-snug">
              {title && <p className={cn("font-display text-base font-bold", TONE_TEXT[tone])}>{title}</p>}
              {message && <RichText text={message} className="text-foreground/90" />}
            </div>
          </div>
        )}
        {extra}
        {actionLabel && onAction && auto && <CountdownAction key={tone} label={actionLabel} className={TONE_BUTTON[tone]} onAction={onAction} onPause={pause} />}
        {actionLabel && onAction && !auto && (
          <Button
            size="lg"
            className={cn("h-12 w-full rounded-xl text-base font-bold shadow-none", TONE_BUTTON[tone])}
            onClick={onAction}
            autoFocus
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
};
