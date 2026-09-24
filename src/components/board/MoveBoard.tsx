import { useMemo, useState, type FC } from "react";
import type { PieceSymbol } from "chess.js";
import { defaultPieces } from "react-chessboard";
import type { BoardSpec, MarkKind } from "@/content/types";
import type { Square } from "@/lib/chess/squares";
import { legalMoves, pieceColorAt, type Color, type MoveInput } from "@/lib/chess/game";
import { Board } from "@/components/board/Board";

interface MoveBoardProps {
  spec: BoardSpec;
  fen: string;
  playerColor: Color;
  enabled: boolean;
  showLegal?: boolean;
  lastMove?: [Square, Square] | null;
  stars?: Square[];
  overlay?: Partial<Record<Square, MarkKind>>;
  extraArrows?: BoardSpec["arrows"];
  onMove: (move: MoveInput) => void;
  onIllegal: (from: Square, to: Square) => void;
}

const PROMOTION_CHOICES: { piece: PieceSymbol; label: string }[] = [
  { piece: "q", label: "Dama" },
  { piece: "r", label: "Torre" },
  { piece: "b", label: "Bispo" },
  { piece: "n", label: "Cavalo" },
];

/** Board where the player moves pieces by tapping (piece, then square) or dragging. */
export const MoveBoard: FC<MoveBoardProps> = ({
  spec,
  fen,
  playerColor,
  enabled,
  showLegal = true,
  lastMove,
  stars,
  overlay,
  extraArrows,
  onMove,
  onIllegal,
}) => {
  const [selected, setSelected] = useState<Square | null>(null);
  const [pending, setPending] = useState<{ from: Square; to: Square } | null>(null);

  const dots = useMemo(() => {
    if (!selected || !showLegal || !enabled) return [];
    return [...new Set(legalMoves(fen, selected).map((m) => m.to as Square))];
  }, [selected, showLegal, enabled, fen]);

  const isOwn = (sq: Square) => pieceColorAt(fen, sq) === playerColor;

  const attempt = (from: Square, to: Square): boolean => {
    setSelected(null);
    const moves = legalMoves(fen, from).filter((m) => m.to === to);
    if (!moves.length) {
      onIllegal(from, to);
      return false;
    }
    if (moves.some((m) => m.promotion)) {
      setPending({ from, to });
      return false;
    }
    onMove({ from, to });
    return true;
  };

  const handleTap = (sq: Square) => {
    if (!enabled || pending) return;
    if (selected) {
      if (sq === selected) {
        setSelected(null);
        return;
      }
      if (isOwn(sq)) {
        setSelected(sq);
        return;
      }
      attempt(selected, sq);
      return;
    }
    if (isOwn(sq)) setSelected(sq);
  };

  const boardSpec: BoardSpec = {
    ...spec,
    fen,
    arrows: [...(spec.arrows ?? []), ...(extraArrows ?? [])],
  };

  return (
    <div className="relative">
      <Board
        spec={boardSpec}
        overlay={overlay}
        onSquareTap={handleTap}
        interaction={{
          selected,
          dots,
          lastMove: lastMove ?? null,
          stars,
          canDrag: (sq) => enabled && !pending && isOwn(sq),
          onDragStart: (sq) => setSelected(sq),
          onDrop: (from, to) => (from === to ? (setSelected(from), false) : attempt(from, to)),
        }}
      />
      {pending && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-[10px] bg-background/70 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-3 shadow-lg">
            <p className="text-sm font-semibold">O peão vira qual peça?</p>
            <div className="flex gap-2">
              {PROMOTION_CHOICES.map((c) => {
                const key = `${playerColor}${c.piece.toUpperCase()}`;
                const Piece = defaultPieces[key];
                return (
                  <button
                    key={c.piece}
                    type="button"
                    data-promotion={c.piece}
                    aria-label={c.label}
                    onClick={() => {
                      const p = pending;
                      setPending(null);
                      onMove({ from: p.from, to: p.to, promotion: c.piece });
                    }}
                    className="flex h-16 w-14 flex-col items-center justify-center rounded-xl border bg-background hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="h-10 w-10">{Piece ? <Piece /> : null}</span>
                    <span className="text-[10px] font-semibold">{c.label}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setPending(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
