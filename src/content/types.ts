import type { Square } from "@/lib/chess/squares";

/** Visual marks drawn over a square. */
export type MarkKind = "focus" | "soft" | "good" | "bad" | "hint" | "ring";

export type ArrowTone = "focus" | "good" | "hint";

export interface BoardSpec {
  /** FEN of the position. Defaults to an empty board. */
  fen?: string;
  orientation?: "white" | "black";
  /** Show letters and numbers on the board edge. Default true. */
  coordinates?: boolean;
  marks?: Partial<Record<Square, MarkKind>>;
  labels?: Partial<Record<Square, string>>;
  arrows?: { from: Square; to: Square; tone?: ArrowTone }[];
  /** Draws the board with light and dark squares swapped (a wrongly placed board). */
  swapColors?: boolean;
  /** Highlights the previous move (from, to). */
  lastMove?: [Square, Square];
}

/**
 * Text fields accept a tiny markup:
 *   `e4`     renders as a coordinate chip
 *   **bold** renders as strong text
 */
export type RichString = string;

export interface ExplainScreen {
  kind: "explain";
  title: string;
  text: RichString;
  board?: BoardSpec;
  tip?: RichString;
  /** Ordered steps shown as a numbered checklist. */
  steps?: RichString[];
}

/** Tap one square; any square in `targets` is accepted. Retries allowed. */
export interface TapScreen {
  kind: "tap";
  key: string;
  prompt: RichString;
  board: BoardSpec;
  targets: Square[];
  /** Feedback for a wrong tap. */
  wrong: (tapped: Square) => RichString;
  /** Shown when the exercise is solved. */
  success: RichString;
  /** Marks revealed after two wrong taps. */
  reveal: Partial<Record<Square, "soft" | "hint">>;
  /** Short note recorded in the mistake log. */
  mistakeNote: RichString;
}

/** Find every square in `targets`. Wrong taps cost points. */
export interface TapAllScreen {
  kind: "tapAll";
  key: string;
  prompt: RichString;
  board: BoardSpec;
  targets: Square[];
  wrong: (tapped: Square) => RichString;
  success: RichString;
  mistakeNote: RichString;
}

/** Multiple choice, one attempt. */
export interface ChoiceScreen {
  kind: "choice";
  key: string;
  prompt: RichString;
  board?: BoardSpec;
  /** Board shown after answering (replaces `board`). */
  revealBoard?: BoardSpec;
  /** When true, the board stays hidden until the answer is given. */
  hideBoardUntilAnswered?: boolean;
  options: { id: string; label: string; mono?: boolean }[];
  correct: string;
  /** Explanation shown after answering, right or wrong. */
  explain: RichString;
  mistakeNote: RichString;
}

/** Timed drill: tap as many named squares as possible before the clock runs out. */
export interface DrillScreen {
  kind: "drill";
  key: string;
  title: string;
  intro: RichString;
  orientation: "white" | "black";
  durationSec: number;
  /** Hits needed for the full 10 points. */
  target: number;
  /** Shown next to the personal record, e.g. "casas de brancas". */
  recordLabel: string;
}

/* ---------- Screens where pieces move ---------- */

/** A legal move as the lesson sees it (chess.js verbose move). */
export type MoveInfo = import("chess.js").Move;

/** Make one move. Illegal moves snap back; legal but wrong moves are mistakes. */
export interface MoveScreen {
  kind: "move";
  key: string;
  prompt: RichString;
  /** Position (fen required). The side to move is the player. */
  board: BoardSpec & { fen: string };
  /** Is this legal move an answer? `after` is the position after it. */
  accept: (move: MoveInfo, after: import("chess.js").Chess) => boolean;
  /** One correct move (for the hint arrow and tests). */
  solution: string;
  /** Feedback for a legal move that is not accepted. */
  wrong?: (move: MoveInfo) => RichString;
  /** Feedback when trying a move the rules do not allow. */
  illegal?: RichString;
  success: RichString | ((move: MoveInfo) => RichString);
  /** Shows legal destinations when a piece is selected. Default true. */
  showLegal?: boolean;
  mistakeNote: RichString;
}

/** Visit every target with the same piece (the player keeps the move). */
export interface PathScreen {
  kind: "path";
  key: string;
  prompt: RichString;
  board: BoardSpec & { fen: string };
  targets: Square[];
  /** Best number of moves. Computed by the solver when omitted. */
  par?: number;
  illegal?: RichString;
  success: RichString;
  mistakeNote: RichString;
}

/** A forced line: player moves are checked, opponent replies are automatic. */
export interface SequenceScreen {
  kind: "sequence";
  key: string;
  prompt: RichString;
  board: BoardSpec & { fen: string };
  /** UCI moves, starting with the player: player, reply, player, ... */
  line: string[];
  /** When true, the final player move may be any checkmate. */
  anyMateAtEnd?: boolean;
  /** Comment shown after each player move (same index as the player's plies). */
  comments?: RichString[];
  /** Feedback for a wrong (but legal) player move. */
  wrong?: (move: MoveInfo, plyIndex: number) => RichString;
  illegal?: RichString;
  success: RichString;
  mistakeNote: RichString;
}

/** Play freely until the goal, against a simple defender. */
export interface PlayScreen {
  kind: "play";
  key: string;
  prompt: RichString;
  board: BoardSpec & { fen: string };
  goal: "mate";
  /** Player moves allowed before the attempt fails. */
  maxMoves: number;
  /** When set, the validator proves a forced mate in this many moves. */
  mateIn?: number;
  hint?: RichString;
  success: RichString;
  mistakeNote: RichString;
}

export type MoveBasedScreen = MoveScreen | PathScreen | SequenceScreen | PlayScreen;

export type Screen = ExplainScreen | TapScreen | TapAllScreen | ChoiceScreen | DrillScreen | MoveBasedScreen;
export type ExerciseScreen = TapScreen | TapAllScreen | ChoiceScreen | DrillScreen | MoveBasedScreen;

export interface LessonDef {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  /** Builds a fresh run: exercises draw new random examples every time. */
  build: () => Screen[];
}

export interface LessonMeta {
  id: string;
  title: string;
  summary: string;
  lesson?: LessonDef;
}

export interface ModuleDef {
  id: string;
  number: number;
  title: string;
  description: string;
  lessons: LessonMeta[];
}

export const POINTS_PER_EXERCISE = 10;

export function isExercise(s: Screen): s is ExerciseScreen {
  return s.kind !== "explain";
}
