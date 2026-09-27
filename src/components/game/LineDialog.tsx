import { useMemo, useState, type FC } from "react";
import { Chess } from "chess.js";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MoveBoard } from "@/components/board/MoveBoard";
import { RichText } from "@/components/common/RichText";
import { moveLabel } from "@/components/lesson/steps/moveText";
import { parseUci, type Color } from "@/lib/chess/game";
import type { Square } from "@/lib/chess/squares";
import { cn } from "@/lib/utils";

/** Every step of a line from a position: its board, and the move that led there. */
function stepsOf(fen: string, line: string[]) {
  const chess = new Chess(fen);
  const steps: { fen: string; san: string | null; lastMove: [Square, Square] | null }[] = [{ fen, san: null, lastMove: null }];
  let label: string | null = null;
  for (const uci of line) {
    try {
      const move = chess.move(parseUci(uci));
      label ??= moveLabel(move);
      steps.push({ fen: chess.fen(), san: move.san, lastMove: [move.from as Square, move.to as Square] });
    } catch {
      break;
    }
  }
  return { steps, label };
}

/**
 * The line the engine calculated from a position, starting with the move it
 * preferred: why it preferred it. A board of its own, so the review behind it
 * stays on the move it was on.
 */
export const LineDialog: FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The position the line starts from: the one before the judged move. */
  fen: string;
  /** The engine's line, in UCI, its preferred move first. */
  line: string[];
  orientation: Color;
}> = ({ open, onOpenChange, fen, line, orientation }) => {
  const { steps, label } = useMemo(() => stepsOf(fen, line), [fen, line]);
  const [step, setStep] = useState(0);
  // Every opening starts from the position before the move.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStep(0);
  }

  const last = steps.length - 1;
  const go = (to: number) => setStep(Math.max(0, Math.min(last, to)));
  // Move numbers as the game had them: "7. d4" or "7... Nf6".
  const [, turn, , , , moveNumber] = fen.split(" ");
  const startNumber = Number(moveNumber) || 1;
  const blackFirst = turn === "b";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[24rem] rounded-2xl" data-line-ply={step} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="font-display">
            <RichText text={label ? `Melhor era ${label}` : "Melhor lance"} />
          </DialogTitle>
        </DialogHeader>
        <MoveBoard
          spec={{ orientation: orientation === "w" ? "white" : "black" }}
          fen={steps[step].fen}
          playerColor={orientation}
          enabled={false}
          lastMove={steps[step].lastMove}
          onMove={() => undefined}
          onIllegal={() => undefined}
        />
        <p className="flex flex-wrap gap-x-2 gap-y-1 font-mono text-sm tabular">
          {steps.slice(1).map((s, i) => {
            const index = i + (blackFirst ? 1 : 0);
            const number = startNumber + Math.floor(index / 2);
            const prefix = index % 2 === 0 ? `${number}.` : i === 0 ? `${number}...` : "";
            return (
              <button
                key={i}
                type="button"
                onClick={() => go(i + 1)}
                className={cn("rounded px-1 -mx-0.5 hover:bg-accent", step === i + 1 && "font-bold")}
              >
                {prefix && <span className="text-muted-foreground">{prefix} </span>}
                {s.san}
              </button>
            );
          })}
        </p>
        <div className="grid grid-cols-4 gap-2">
          <Button variant="outline" className="h-11 rounded-xl" aria-label="Início da linha" disabled={step === 0} onClick={() => go(0)}>
            <ChevronsLeft className="!h-5 !w-5" />
          </Button>
          <Button variant="outline" className="h-11 rounded-xl" aria-label="Lance anterior da linha" disabled={step === 0} onClick={() => go(step - 1)}>
            <ChevronLeft className="!h-5 !w-5" />
          </Button>
          <Button variant="outline" className="h-11 rounded-xl" aria-label="Próximo lance da linha" disabled={step === last} onClick={() => go(step + 1)}>
            <ChevronRight className="!h-5 !w-5" />
          </Button>
          <Button variant="outline" className="h-11 rounded-xl" aria-label="Fim da linha" disabled={step === last} onClick={() => go(last)}>
            <ChevronsRight className="!h-5 !w-5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
