import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { playSound } from "@/lib/sound";
import type { MarkKind, TapAllScreen } from "@/content/types";
import type { Square } from "@/lib/chess/squares";
import { pointsForWrongTaps } from "@/lib/progress/scoring";
import { Board } from "@/components/board/Board";
import { RichText } from "@/components/common/RichText";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";

export const TapAllStep: FC<{ screen: TapAllScreen; onDone: StepDone }> = ({ screen, onDone }) => {
  const [found, setFound] = useState<Square[]>([]);
  const [wrongTaps, setWrongTaps] = useState(0);
  const [flash, setFlash] = useState<Square | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const solved = found.length === screen.targets.length;
  const missing = screen.targets.filter((t) => !found.includes(t));
  const showHint = wrongTaps >= 2 && !solved;

  const overlay = useMemo(() => {
    const o: Partial<Record<Square, MarkKind>> = {};
    for (const f of found) o[f] = "good";
    if (showHint && missing[0]) o[missing[0]] = "hint";
    if (flash) o[flash] = "bad";
    return o;
  }, [found, showHint, missing, flash]);

  const handleTap = (sq: Square) => {
    if (solved || found.includes(sq)) return;
    if (screen.targets.includes(sq)) {
      setFound((f) => [...f, sq]);
      setMessage(null);
      playSound(found.length + 1 === screen.targets.length ? "correct" : "tick");
      return;
    }
    if (screen.board.marks?.[sq]) return; // tapping the given ends is not a mistake
    setWrongTaps((n) => n + 1);
    playSound("wrong");
    setMessage(screen.wrong(sq));
    setFlash(sq);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 900);
  };

  const points = pointsForWrongTaps(wrongTaps);
  const finish = () =>
    onDone({
      key: screen.key,
      points,
      max: 10,
      firstTry: wrongTaps === 0,
      mistakeNote: wrongTaps > 0 ? screen.mistakeNote : undefined,
    });

  let footer;
  if (solved) {
    footer = (
      <FeedbackBar
        tone={wrongTaps === 0 ? "correct" : "partial"}
        title={wrongTaps === 0 ? `Perfeito! +${points} XP` : `Completou. +${points} XP`}
        message={screen.success}
        actionLabel="Continuar"
        onAction={finish}
      />
    );
  } else if (message) {
    footer = <FeedbackBar tone="wrong" title={showHint ? "Olha a dica no tabuleiro" : "Essa não"} message={message} onDismiss={() => setMessage(null)} />;
  } else {
    footer = (
      <FeedbackBar
        tone="neutral"
        message={`Encontradas: ${found.length} de ${screen.targets.length}.`}
      />
    );
  }

  return (
    <StepLayout footer={footer} solution={{ tap: screen.targets }}>
      <StepPrompt eyebrow="Pratique">
        <RichText text={screen.prompt} />
      </StepPrompt>
      <div key={wrongTaps} className={wrongTaps > 0 ? "animate-shake" : undefined}>
        <Board spec={screen.board} overlay={overlay} onSquareTap={handleTap} />
      </div>
    </StepLayout>
  );
};
