import { useMemo, useState, type FC } from "react";
import { moveSound, playSound } from "@/lib/sound";
import type { PathScreen } from "@/content/types";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";
import { pieceColorAt, play, solvePath, turnOf, withTurn, type MoveInput } from "@/lib/chess/game";
import { MoveBoard } from "@/components/board/MoveBoard";
import { RichText } from "@/components/common/RichText";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";
import { DEFAULT_ILLEGAL } from "@/components/lesson/steps/moveText";

function pathPoints(moves: number, par: number): number {
  const extra = moves - par;
  return extra <= 0 ? 10 : Math.max(10 - extra * 2, 4);
}

export const PathStep: FC<{ screen: PathScreen; onDone: StepDone }> = ({ screen, onDone }) => {
  const startFen = screen.board.fen;
  const player = turnOf(startFen);
  const solution = useMemo(() => {
    const from = ALL_SQUARES.find((sq) => pieceColorAt(startFen, sq) === player)!;
    return solvePath(startFen, from, screen.targets) ?? [];
  }, [startFen, player, screen.targets]);
  const par = screen.par ?? solution.length;

  const [fen, setFen] = useState(startFen);
  const [collected, setCollected] = useState<Square[]>([]);
  const [moves, setMoves] = useState(0);
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const remaining = screen.targets.filter((t) => !collected.includes(t));
  const done = remaining.length === 0;

  const onMove = (input: MoveInput) => {
    const played = play(fen, input);
    if (!played) return;
    setFen(withTurn(played.fen, player));
    setLastMove([input.from, input.to]);
    setMoves((n) => n + 1);
    setMessage(null);
    playSound(moveSound(played.move));
    if (screen.targets.includes(input.to) && !collected.includes(input.to)) {
      const last = collected.length + 1 === screen.targets.length;
      window.setTimeout(() => playSound(last ? "correct" : "tick"), 120);
      setCollected((c) => [...c, input.to]);
    }
  };

  const reset = () => {
    setFen(startFen);
    setCollected([]);
    setMoves(0);
    setLastMove(null);
    setMessage(null);
  };

  const points = pathPoints(moves, par);
  let footer;
  if (done) {
    footer = (
      <FeedbackBar
        tone={moves <= par ? "correct" : "partial"}
        title={`${moves <= par ? "Perfeito!" : "Conseguiu."} +${points} XP`}
        message={`${moves} ${moves === 1 ? "lance" : "lances"} (o mínimo é ${par}). ${screen.success}`}
        actionLabel="Continuar"
        onAction={() => onDone({ key: screen.key, points, max: 10, firstTry: moves <= par, mistakeNote: moves > par ? screen.mistakeNote : undefined })}
      />
    );
  } else if (message) {
    footer = <FeedbackBar tone="wrong" title="Esse lance não vale" message={message} onDismiss={() => setMessage(null)} />;
  } else {
    footer = (
      <FeedbackBar
        tone="neutral"
        message={`Alvos: ${collected.length} de ${screen.targets.length} · lances: ${moves} (dá para fazer em ${par})`}
        extra={
          moves > 0 ? (
            <button type="button" onClick={reset} className="self-start text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
              Recomeçar
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <StepLayout footer={footer} solution={{ moves: solution }}>
      <StepPrompt eyebrow="Pratique">
        <RichText text={screen.prompt} />
      </StepPrompt>
      <MoveBoard
        spec={screen.board}
        fen={fen}
        playerColor={player}
        enabled={!done}
        lastMove={lastMove}
        stars={remaining}
        overlay={Object.fromEntries(collected.map((c) => [c, "good"]))}
        onMove={onMove}
        onIllegal={() => {
          playSound("wrong");
          setMessage(screen.illegal ?? DEFAULT_ILLEGAL);
        }}
      />
    </StepLayout>
  );
};
