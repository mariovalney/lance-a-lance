import { useEffect, useRef, useState, type FC } from "react";
import { moveSound, playSound } from "@/lib/sound";
import type { PlayScreen } from "@/content/types";
import type { Square } from "@/lib/chess/squares";
import { play, turnOf, type MoveInput } from "@/lib/chess/game";
import { defenderMove } from "@/lib/chess/defender";
import { MoveBoard } from "@/components/board/MoveBoard";
import { RichText } from "@/components/common/RichText";
import { FeedbackBar } from "@/components/lesson/FeedbackBar";
import { StepLayout, StepPrompt } from "@/components/lesson/StepLayout";
import type { StepDone } from "@/components/lesson/types";
import { DEFAULT_ILLEGAL, MOVE_HELP } from "@/components/lesson/steps/moveText";

type Status = "playing" | "won" | "failed";
const POINTS_BY_ATTEMPT = [10, 7, 5, 3];

export const PlayStep: FC<{ screen: PlayScreen; onDone: StepDone }> = ({ screen, onDone }) => {
  const startFen = screen.board.fen;
  const player = turnOf(startFen);
  const [fen, setFen] = useState(startFen);
  const [lastMove, setLastMove] = useState<[Square, Square] | null>(null);
  const [moves, setMoves] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [status, setStatus] = useState<Status>("playing");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "wrong" | "neutral"; text: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const fail = (text: string) => {
    playSound("wrong");
    setStatus("failed");
    setMessage({ tone: "wrong", text });
  };

  const onMove = (input: MoveInput) => {
    const played = play(fen, input);
    if (!played) return;
    const used = moves + 1;
    setFen(played.fen);
    setLastMove([input.from, input.to]);
    setMoves(used);
    setMessage(null);
    const g = played.game;
    playSound(moveSound(played.move));
    if (g.isCheckmate()) {
      window.setTimeout(() => playSound("correct"), 160);
      setStatus("won");
      return;
    }
    if (g.isStalemate()) return fail("Afogamento: o rei não está em xeque e não tem lances. Isso é empate. Deixe sempre uma casa livre até o golpe final.");
    if (g.isDraw()) return fail("A partida terminou empatada. Cuidado para não deixar suas peças serem capturadas.");
    if (used >= screen.maxMoves) return fail(`Acabaram os ${screen.maxMoves} lances. Tente de novo com o plano da lição.`);
    setBusy(true);
    timer.current = window.setTimeout(() => {
      const reply = defenderMove(played.fen);
      if (reply) {
        const r = play(played.fen, { from: reply.from as Square, to: reply.to as Square, promotion: reply.promotion });
        if (r) {
          setFen(r.fen);
          setLastMove([reply.from as Square, reply.to as Square]);
          playSound(moveSound(r.move));
          if (r.game.isDraw()) fail(reply.captured ? "O rei capturou uma peça sua sem proteção e não sobrou material para dar mate." : "A partida terminou empatada.");
        }
      }
      setBusy(false);
    }, 550);
  };

  const retry = () => {
    setFen(startFen);
    setLastMove(null);
    setMoves(0);
    setStatus("playing");
    setMessage(null);
    setAttempt((a) => a + 1);
  };

  const points = POINTS_BY_ATTEMPT[Math.min(attempt - 1, POINTS_BY_ATTEMPT.length - 1)];
  const skip = () => onDone({ key: screen.key, points: 0, max: 10, firstTry: false, mistakeNote: screen.mistakeNote });

  let footer;
  if (status === "won") {
    footer = (
      <FeedbackBar
        tone={attempt === 1 ? "correct" : "partial"}
        title={`Xeque-mate! +${points} XP`}
        message={`Em ${moves} ${moves === 1 ? "lance" : "lances"}. ${screen.success}`}
        actionLabel="Continuar"
        onAction={() => onDone({ key: screen.key, points, max: 10, firstTry: attempt === 1, mistakeNote: attempt > 1 ? screen.mistakeNote : undefined })}
      />
    );
  } else if (status === "failed") {
    footer = (
      <FeedbackBar
        tone="wrong"
        title="Não deu dessa vez"
        message={message?.text}
        actionLabel="Tentar de novo"
        onAction={retry}
        extra={
          <button type="button" onClick={skip} className="self-start text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Pular este exercício
          </button>
        }
      />
    );
  } else {
    footer = (
      <FeedbackBar
        tone={message?.tone === "wrong" ? "wrong" : "neutral"}
        message={message?.text ?? `Lances: ${moves} de ${screen.maxMoves}. ${screen.hint ?? MOVE_HELP}`}
        onDismiss={() => setMessage(null)}
        extra={
          <button type="button" onClick={skip} className="self-start text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Pular este exercício
          </button>
        }
      />
    );
  }

  return (
    <StepLayout footer={footer} solution={{ play: true, fen, skip: true }}>
      <StepPrompt eyebrow={`Jogue até o mate${attempt > 1 ? ` · tentativa ${attempt}` : ""}`}>
        <RichText text={screen.prompt} />
      </StepPrompt>
      <MoveBoard
        spec={screen.board}
        fen={fen}
        playerColor={player}
        enabled={status === "playing" && !busy}
        lastMove={lastMove}
        onMove={onMove}
        onIllegal={() => setMessage({ tone: "wrong", text: DEFAULT_ILLEGAL })}
      />
    </StepLayout>
  );
};
