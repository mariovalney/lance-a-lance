import { useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { moveSound, playSound } from "@/lib/sound";
import type { SequenceScreen } from "@/content/types";
import type { Square } from "@/lib/chess/squares";
import { parseUci, play, turnOf, uciOf, type MoveInput } from "@/lib/chess/game";
import { pointsForWrongTaps } from "@/lib/progress/scoring";
import { MoveBoard } from "@/components/board/MoveBoard";
import { RichText } from "@/components/common/RichText";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";
import { DEFAULT_ILLEGAL, MOVE_HELP, moveLabel } from "@/components/lesson/steps/moveText";

export interface SequenceFinish {
  /** Solved with no wrong move and without asking for the solution. */
  perfect: boolean;
  gaveUp: boolean;
}

interface SequenceStepProps {
  screen: SequenceScreen;
  onDone: StepDone;
  /** Custom title for the solved state. */
  titleFor?: (perfect: boolean) => string;
  /** Continue on its own after solving. Default true. */
  autoAdvance?: boolean;
  /** Show an arrow after two wrong tries. Default true. */
  hintArrows?: boolean;
  /** Offer "Ver solução" (counts as a miss). */
  allowGiveUp?: boolean;
  /** Called once when the line ends (solved or shown). */
  onFinish?: (info: SequenceFinish) => void;
  /** Replaces the default footer once the line ends. */
  doneFooter?: ReactNode;
}

export const SequenceStep: FC<SequenceStepProps> = ({
  screen,
  onDone,
  titleFor,
  autoAdvance = true,
  hintArrows = true,
  allowGiveUp = false,
  onFinish,
  doneFooter,
}) => {
  const startFen = screen.board.fen;
  const player = turnOf(startFen);
  const [fen, setFen] = useState(startFen);
  const [ply, setPly] = useState(0);
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(screen.board.lastMove ?? null);
  const [wrong, setWrong] = useState(0);
  const [wrongHere, setWrongHere] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [message, setMessage] = useState<{ tone: "wrong" | "neutral"; text: string } | null>(null);
  const timers = useRef<number[]>([]);
  const finished = useRef(false);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  useEffect(() => {
    if (done && !finished.current) {
      finished.current = true;
      onFinish?.({ perfect: wrong === 0 && !gaveUp, gaveUp });
    }
  }, [done, wrong, gaveUp, onFinish]);

  const isLastPlayerPly = (p: number) => p >= screen.line.length - 1;

  const onMove = (input: MoveInput) => {
    const expected = screen.line[ply];
    const played = play(fen, input);
    if (!played) return;
    const ok = uciOf(played.move) === expected || (screen.anyMateAtEnd && isLastPlayerPly(ply) && played.game.isCheckmate());
    setFen(played.fen);
    setLastMove([played.move.from as Square, played.move.to as Square]);
    playSound(moveSound(played.move));
    if (!ok) {
      later(() => playSound("wrong"), 140);
      setWrong((n) => n + 1);
      setWrongHere((n) => n + 1);
      setMessage({ tone: "wrong", text: screen.wrong?.(played.move, ply / 2) ?? `Você jogou ${moveLabel(played.move)}. Não é o melhor aqui, tente de novo.` });
      setBusy(true);
      const before = fen;
      later(() => {
        setFen(before);
        setLastMove(null);
        setBusy(false);
      }, 1100);
      return;
    }
    setWrongHere(0);
    const comment = screen.comments?.[ply / 2];
    setMessage(comment ? { tone: "neutral", text: `${moveLabel(played.move)}. ${comment}` } : null);
    if (ply + 1 >= screen.line.length) {
      later(() => playSound("correct"), 160);
      setDone(true);
      return;
    }
    setBusy(true);
    const reply = screen.line[ply + 1];
    later(() => {
      const r = play(played.fen, parseUci(reply));
      if (r) {
        setFen(r.fen);
        setLastMove([r.move.from as Square, r.move.to as Square]);
        playSound(moveSound(r.move));
      }
      setPly(ply + 2);
      setBusy(false);
      if (ply + 2 >= screen.line.length) setDone(true);
    }, 650);
  };

  const onIllegal = () => {
    playSound("wrong");
    setWrong((n) => n + 1);
    setWrongHere((n) => n + 1);
    setMessage({ tone: "wrong", text: screen.illegal ?? DEFAULT_ILLEGAL });
  };

  /** Plays the rest of the solution on the board. */
  const giveUp = () => {
    if (busy || done) return;
    setGaveUp(true);
    setBusy(true);
    setMessage(null);
    let current = fen;
    screen.line.slice(ply).forEach((uci, k) => {
      later(() => {
        const r = play(current, parseUci(uci));
        if (!r) return;
        current = r.fen;
        setFen(r.fen);
        setLastMove([r.move.from as Square, r.move.to as Square]);
        playSound(moveSound(r.move));
      }, 300 + k * 800);
    });
    later(() => {
      setPly(screen.line.length);
      setBusy(false);
      setDone(true);
    }, 300 + (screen.line.length - ply) * 800);
  };

  const points = gaveUp ? 0 : pointsForWrongTaps(wrong);
  const expected = screen.line[ply] ? parseUci(screen.line[ply]) : null;
  const showHint = hintArrows && !done && wrongHere >= 2 && expected;
  const playerMoves = screen.line.filter((_, i) => i % 2 === 0).map(parseUci);
  const total = playerMoves.length;
  const doneMoves = Math.min(Math.ceil(ply / 2), total);
  const giveUpButton =
    allowGiveUp && !done ? (
      <button
        type="button"
        onClick={giveUp}
        disabled={busy}
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
      >
        <Eye className="h-4 w-4" aria-hidden /> Ver solução
      </button>
    ) : undefined;

  let footer;
  if (done && doneFooter) {
    footer = doneFooter;
  } else if (done) {
    footer = (
      <FeedbackBar
        tone={gaveUp ? "wrong" : wrong === 0 ? "correct" : "partial"}
        title={gaveUp ? "Solução mostrada" : titleFor ? titleFor(wrong === 0) : `${wrong === 0 ? "Perfeito!" : "Conseguiu."} +${points} XP`}
        message={message?.tone === "neutral" ? `${message.text} ${screen.success}` : screen.success}
        actionLabel="Continuar"
        autoAdvance={autoAdvance}
        onAction={() => onDone({ key: screen.key, points, max: 10, firstTry: wrong === 0 && !gaveUp, mistakeNote: wrong || gaveUp ? screen.mistakeNote : undefined })}
      />
    );
  } else if (message) {
    footer = (
      <FeedbackBar
        tone={message.tone === "wrong" ? "wrong" : "neutral"}
        title={message.tone === "wrong" ? (showHint ? "Olha a seta no tabuleiro" : "Ainda não") : undefined}
        message={message.text}
        extra={giveUpButton}
        onDismiss={() => setMessage((m) => (m?.tone === "wrong" ? null : m))}
      />
    );
  } else {
    footer = <FeedbackBar tone="neutral" message={total > 1 ? `Lance ${doneMoves + 1} de ${total}. ${MOVE_HELP}` : MOVE_HELP} extra={giveUpButton} />;
  }

  return (
    <StepLayout footer={footer} solution={{ moves: playerMoves }}>
      <StepPrompt eyebrow={player === "w" ? "Brancas jogam" : "Pretas jogam"}>
        <RichText text={screen.prompt} />
      </StepPrompt>
      <MoveBoard
        spec={screen.board}
        fen={fen}
        playerColor={player}
        enabled={!done && !busy}
        lastMove={lastMove}
        extraArrows={showHint && expected ? [{ from: expected.from, to: expected.to, tone: "hint" }] : undefined}
        onMove={onMove}
        onIllegal={onIllegal}
      />
    </StepLayout>
  );
};
