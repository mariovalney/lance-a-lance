import { useEffect, useRef, useState, type FC } from "react";
import { moveSound, playSound } from "@/lib/sound";
import type { Move } from "chess.js";
import type { MoveScreen } from "@/content/types";
import type { Square } from "@/lib/chess/squares";
import { parseUci, play, turnOf, type MoveInput } from "@/lib/chess/game";
import { pointsForAttempt } from "@/lib/progress/scoring";
import { MoveBoard } from "@/components/board/MoveBoard";
import { RichText } from "@/components/common/RichText";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";
import { DEFAULT_ILLEGAL, MOVE_HELP, moveLabel } from "@/components/lesson/steps/moveText";

export const MoveStep: FC<{ screen: MoveScreen; onDone: StepDone }> = ({ screen, onDone }) => {
  const startFen = screen.board.fen;
  const player = turnOf(startFen);
  const [fen, setFen] = useState(startFen);
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(screen.board.lastMove ?? null);
  const [wrongCount, setWrongCount] = useState(0);
  const [solved, setSolved] = useState<Move | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onMove = (input: MoveInput) => {
    const played = play(fen, input);
    if (!played) return;
    setFen(played.fen);
    setLastMove([played.move.from as Square, played.move.to as Square]);
    playSound(moveSound(played.move));
    if (screen.accept(played.move, played.game)) {
      setSolved(played.move);
      setMessage(null);
      window.setTimeout(() => playSound("correct"), 140);
      return;
    }
    window.setTimeout(() => playSound("wrong"), 140);
    setWrongCount((n) => n + 1);
    setMessage(screen.wrong?.(played.move) ?? `Você jogou ${moveLabel(played.move)}. Não é esse, tente outro lance.`);
    setBusy(true);
    timer.current = window.setTimeout(() => {
      setFen(startFen);
      setLastMove(screen.board.lastMove ?? null);
      setBusy(false);
    }, 1100);
  };

  const onIllegal = () => {
    playSound("wrong");
    setWrongCount((n) => n + 1);
    setMessage(screen.illegal ?? DEFAULT_ILLEGAL);
  };

  const points = pointsForAttempt(wrongCount + 1);
  const sol = parseUci(screen.solution);
  const showHint = wrongCount >= 2 && !solved;

  let footer;
  if (solved) {
    const text = typeof screen.success === "function" ? screen.success(solved) : screen.success;
    footer = (
      <FeedbackBar
        tone={wrongCount === 0 ? "correct" : "partial"}
        title={`${wrongCount === 0 ? "Certo!" : "Conseguiu."} +${points} XP`}
        message={`${moveLabel(solved)}. ${text}`}
        actionLabel="Continuar"
        onAction={() =>
          onDone({ key: screen.key, points, max: 10, firstTry: wrongCount === 0, mistakeNote: wrongCount ? screen.mistakeNote : undefined })
        }
      />
    );
  } else if (message) {
    footer = <FeedbackBar tone="wrong" title={showHint ? "Olha a seta no tabuleiro" : "Ainda não"} message={message} onDismiss={() => setMessage(null)} />;
  } else {
    footer = <FeedbackBar tone="neutral" message={MOVE_HELP} />;
  }

  return (
    <StepLayout footer={footer} solution={{ moves: [sol] }}>
      <StepPrompt eyebrow={player === "w" ? "Brancas jogam" : "Pretas jogam"}>
        <RichText text={screen.prompt} />
      </StepPrompt>
      <MoveBoard
        spec={screen.board}
        fen={fen}
        playerColor={player}
        enabled={!solved && !busy}
        showLegal={screen.showLegal ?? true}
        lastMove={lastMove}
        extraArrows={showHint ? [{ from: sol.from, to: sol.to, tone: "hint" }] : undefined}
        onMove={onMove}
        onIllegal={onIllegal}
      />
    </StepLayout>
  );
};
