import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { playSound } from "@/lib/sound";
import type { MarkKind, TapScreen } from "@/content/types";
import type { Square } from "@/lib/chess/squares";
import { pointsForAttempt } from "@/lib/progress/scoring";
import { Board } from "@/components/board/Board";
import { RichText } from "@/components/common/RichText";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";

export const TapStep: FC<{ screen: TapScreen; onDone: StepDone }> = ({ screen, onDone }) => {
  const [wrongCount, setWrongCount] = useState(0);
  const [solvedAt, setSolvedAt] = useState<Square | null>(null);
  const [flash, setFlash] = useState<Square | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const revealed = wrongCount >= 2 && !solvedAt;

  const overlay = useMemo(() => {
    const o: Partial<Record<Square, MarkKind>> = {};
    if (revealed) Object.assign(o, screen.reveal);
    if (flash) o[flash] = "bad";
    if (solvedAt) o[solvedAt] = "good";
    return o;
  }, [revealed, screen.reveal, flash, solvedAt]);

  const handleTap = (sq: Square) => {
    if (solvedAt) return;
    if (screen.targets.includes(sq)) {
      window.clearTimeout(timer.current);
      setFlash(null);
      setSolvedAt(sq);
      setMessage(null);
      playSound("correct");
      return;
    }
    setWrongCount((n) => n + 1);
    playSound("wrong");
    setMessage(screen.wrong(sq));
    setFlash(sq);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 900);
  };

  const points = pointsForAttempt(wrongCount + 1);
  const finish = () =>
    onDone({
      key: screen.key,
      points,
      max: 10,
      firstTry: wrongCount === 0,
      mistakeNote: wrongCount > 0 ? screen.mistakeNote : undefined,
    });

  let footer;
  if (solvedAt) {
    footer = (
      <FeedbackBar
        tone={wrongCount === 0 ? "correct" : "partial"}
        title={wrongCount === 0 ? `Certo! +${points} XP` : `Conseguiu. +${points} XP`}
        message={screen.success}
        actionLabel="Continuar"
        onAction={finish}
      />
    );
  } else if (message) {
    footer = (
      <FeedbackBar
        tone="wrong"
        title={revealed ? "Olha a dica no tabuleiro" : "Ainda não"}
        message={message}
        onDismiss={() => setMessage(null)}
      />
    );
  } else {
    footer = <FeedbackBar tone="neutral" message="Toque em uma casa do tabuleiro." />;
  }

  return (
    <StepLayout footer={footer} solution={{ tap: screen.targets.slice(0, 1) }}>
      <StepPrompt eyebrow="Pratique">
        <RichText text={screen.prompt} />
      </StepPrompt>
      <div key={wrongCount} className={wrongCount > 0 ? "animate-shake" : undefined}>
        <Board spec={screen.board} overlay={overlay} onSquareTap={handleTap} />
      </div>
    </StepLayout>
  );
};
