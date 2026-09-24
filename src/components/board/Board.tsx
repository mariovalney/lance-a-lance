import { memo, useMemo, useRef, type CSSProperties, type FC } from "react";
import { Check, Star } from "lucide-react";
import { Chessboard, type ChessboardOptions } from "react-chessboard";
import type { ArrowTone, BoardSpec, MarkKind } from "@/content/types";
import { EMPTY_FEN, FILES, RANKS, type Square } from "@/lib/chess/squares";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

let boardCounter = 0;

const ARROW_COLORS: Record<ArrowTone, string> = {
  focus: "#3d5ce0",
  good: "#1e9e6a",
  hint: "#d99a0e",
};

const MARK_STYLE: Record<MarkKind, CSSProperties> = {
  focus: { background: "var(--mark-focus)" },
  soft: { background: "var(--mark-soft)" },
  good: { background: "var(--mark-good)" },
  bad: { background: "var(--mark-bad)" },
  hint: { background: "var(--mark-hint)" },
  ring: { boxShadow: "inset 0 0 0 3px hsl(var(--primary))" },
};

/** Extra state for boards where pieces move. */
export interface BoardInteraction {
  selected?: Square | null;
  /** Legal destinations of the selected piece. */
  dots?: Square[];
  lastMove?: [Square, Square] | null;
  /** Target markers (stars) still to be collected. */
  stars?: Square[];
  canDrag?: (square: Square) => boolean;
  onDragStart?: (square: Square) => void;
  /** Return true to accept the drop. */
  onDrop?: (from: Square, to: Square) => boolean;
}

export interface BoardProps {
  spec: BoardSpec;
  /** Runtime marks layered over the spec marks (feedback, found squares). */
  overlay?: Partial<Record<Square, MarkKind>>;
  onSquareTap?: (square: Square) => void;
  interaction?: BoardInteraction;
  className?: string;
  ariaLabel?: string;
}

const BoardImpl: FC<BoardProps> = ({ spec, overlay, onSquareTap, interaction, className, ariaLabel }) => {
  const idRef = useRef(`board${++boardCounter}`);
  const settings = useSettings();
  const coordinates = spec.coordinates ?? true;
  const outside = coordinates && settings.coords === "outside";
  const orientation = spec.orientation ?? "white";
  const swap = spec.swapColors ?? false;

  const marks = useMemo(() => ({ ...(spec.marks ?? {}), ...(overlay ?? {}) }), [spec.marks, overlay]);
  const labels = spec.labels ?? {};
  const interactive = Boolean(onSquareTap);
  const dots = interaction?.dots ?? [];
  const stars = interaction?.stars ?? [];
  const last = interaction?.lastMove ?? spec.lastMove ?? null;
  const selected = interaction?.selected ?? null;

  const options: ChessboardOptions = {
    id: idRef.current,
    position: spec.fen ?? EMPTY_FEN,
    boardOrientation: orientation,
    showNotation: coordinates && !outside,
    allowDragging: Boolean(interaction?.onDrop),
    dragActivationDistance: 6,
    canDragPiece: interaction?.canDrag ? ({ square }) => Boolean(square && interaction.canDrag!(square as Square)) : undefined,
    onPieceDrag: interaction?.onDragStart ? ({ square }) => square && interaction.onDragStart!(square as Square) : undefined,
    onPieceDrop: interaction?.onDrop
      ? ({ sourceSquare, targetSquare }) => (targetSquare ? interaction.onDrop!(sourceSquare as Square, targetSquare as Square) : false)
      : undefined,
    allowDrawingArrows: false,
    showAnimations: true,
    animationDurationInMs: 220,
    arrows: (spec.arrows ?? []).map((a) => ({
      startSquare: a.from,
      endSquare: a.to,
      color: ARROW_COLORS[a.tone ?? "focus"],
    })),
    boardStyle: {
      borderRadius: "10px",
      overflow: "hidden",
      boxShadow: "0 1px 0 hsl(var(--border)), 0 8px 24px -12px rgba(15, 20, 35, 0.35)",
    },
    lightSquareStyle: { backgroundColor: swap ? "var(--board-dark)" : "var(--board-light)" },
    darkSquareStyle: { backgroundColor: swap ? "var(--board-light)" : "var(--board-dark)" },
    lightSquareNotationStyle: { color: swap ? "var(--board-coord-on-dark)" : "var(--board-coord-on-light)" },
    darkSquareNotationStyle: { color: swap ? "var(--board-coord-on-light)" : "var(--board-coord-on-dark)" },
    alphaNotationStyle: {
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: "11px",
      fontWeight: 700,
      position: "absolute",
      bottom: 0,
      right: 3,
      userSelect: "none",
      zIndex: 2,
    },
    numericNotationStyle: {
      fontFamily: '"JetBrains Mono", ui-monospace, monospace',
      fontSize: "11px",
      fontWeight: 700,
      position: "absolute",
      top: 1,
      left: 3,
      userSelect: "none",
      zIndex: 2,
    },
    onSquareClick: onSquareTap ? ({ square }) => onSquareTap(square as Square) : undefined,
    squareRenderer: ({ square, piece, children }) => {
      const mark = marks[square as Square];
      const label = labels[square as Square];
      const isLast = last !== null && (last[0] === square || last[1] === square);
      const isSelected = selected === square;
      const hasDot = dots.includes(square as Square);
      const hasStar = stars.includes(square as Square);
      return (
        <div
          className="relative flex h-full w-full items-center justify-center"
          style={{ cursor: interactive ? "pointer" : "default" }}
        >
          {isLast && <div className="pointer-events-none absolute inset-0" style={{ background: "var(--mark-last)" }} />}
          {isSelected && <div className="pointer-events-none absolute inset-0" style={{ background: "var(--mark-selected)" }} />}
          {mark && (
            <div
              className={cn("pointer-events-none absolute inset-0 transition-colors", mark === "hint" && "animate-pulse")}
              style={MARK_STYLE[mark]}
            />
          )}
          {hasStar && !piece && (
            <Star className="pointer-events-none absolute h-[55%] w-[55%] fill-gold text-gold drop-shadow" strokeWidth={1.5} aria-hidden />
          )}
          {hasStar && piece && (
            <div className="pointer-events-none absolute inset-[6%] rounded-full" style={{ boxShadow: "0 0 0 3px hsl(var(--gold))" }} />
          )}
          {children}
          {hasDot &&
            (piece ? (
              <div className="pointer-events-none absolute inset-0 z-[2]" style={{ boxShadow: "inset 0 0 0 5px var(--dot)", borderRadius: "50%" }} />
            ) : (
              <div className="pointer-events-none absolute z-[2] h-[30%] w-[30%] rounded-full" style={{ background: "var(--dot)" }} />
            ))}
          {mark === "good" && (
            <span
              className="pointer-events-none absolute right-[4%] top-[4%] z-[3] grid h-[34%] w-[34%] place-items-center rounded-full bg-success text-success-foreground shadow"
              aria-hidden
            >
              <Check className="h-[70%] w-[70%]" strokeWidth={3.5} />
            </span>
          )}
          {label && (
            <span
              className={cn(
                "pointer-events-none absolute z-[3] rounded px-1 font-mono font-bold leading-tight",
                piece ? "bottom-[3%] left-1/2 -translate-x-1/2 text-[9px]" : "text-[11px]",
              )}
              style={{ background: "var(--mark-label-bg)", color: "var(--mark-label-fg)" }}
            >
              {label}
            </span>
          )}
        </div>
      );
    },
  };

  const files = orientation === "white" ? FILES : [...FILES].reverse();
  const ranks = orientation === "white" ? [...RANKS].reverse() : RANKS;

  return (
    <div
      className={cn("mx-auto w-full select-none", className)}
      style={{ maxWidth: "min(100%, 30rem, calc(100dvh - 330px))", minWidth: "min(100%, 240px)" }}
      role="group"
      aria-label={ariaLabel ?? "Tabuleiro"}
    >
      {outside ? (
        <div className="grid grid-cols-[14px_1fr] grid-rows-[1fr_16px] gap-x-1">
          <div className="flex flex-col" aria-hidden>
            {ranks.map((r) => (
              <span key={r} className="flex flex-1 items-center justify-center font-mono text-[11px] font-bold text-muted-foreground">
                {r}
              </span>
            ))}
          </div>
          <Chessboard options={options} />
          <div />
          <div className="flex" aria-hidden>
            {files.map((f) => (
              <span key={f} className="flex flex-1 items-end justify-center font-mono text-[11px] font-bold leading-none text-muted-foreground">
                {f}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <Chessboard options={options} />
      )}
    </div>
  );
};

export const Board = memo(BoardImpl);
