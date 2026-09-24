import type { BoardSpec, Screen } from "@/content/types";
import PUZZLES from "@/content/data/puzzles.json";
import { orientationOf } from "@/content/lib/positions";
import type { Square } from "@/lib/chess/squares";
import { pickDistinct } from "@/lib/random";

export type PuzzleTheme = keyof typeof PUZZLES;

export interface Puzzle {
  id: string;
  fen: string;
  last: string;
  line: string[];
  rating: number;
  mate: boolean;
}

export function puzzlesOf(theme: PuzzleTheme): Puzzle[] {
  return PUZZLES[theme] as Puzzle[];
}

/** Board for a puzzle: seen from the side to move, with the opponent's last move marked. */
export function puzzleBoard(p: Puzzle, extra: Partial<BoardSpec> = {}): BoardSpec & { fen: string } {
  return {
    fen: p.fen,
    orientation: orientationOf(p.fen),
    lastMove: [p.last.slice(0, 2) as Square, p.last.slice(2, 4) as Square],
    ...extra,
  };
}

interface PuzzleOptions {
  /** What to look for, e.g. "um garfo". */
  lookFor: string;
  hint: string;
  success: string;
  note: string;
  /** Skip the first N puzzles of the pool (used as examples). */
  skip?: number;
}

/** Real games from the Lichess puzzle database (CC0). Opponent replies are automatic. */
export function puzzleRounds(theme: PuzzleTheme, n: number, o: PuzzleOptions): Screen[] {
  const pool = puzzlesOf(theme).slice(o.skip ?? 0);
  return pickDistinct(pool, n).map((p) => {
    const plies = Math.ceil(p.line.length / 2);
    return {
      kind: "sequence",
      key: `puzzle:${theme}:${p.id}`,
      prompt: `Procure ${o.lookFor}.${plies > 1 ? ` São ${plies} lances seus.` : ""}`,
      board: puzzleBoard(p),
      line: p.line,
      anyMateAtEnd: p.mate,
      wrong: (m, i) => (i === 0 ? `\`${m.san}\` não é o golpe. ${o.hint}` : `\`${m.san}\` deixa escapar a vantagem. Continue o ataque.`),
      success: o.success,
      mistakeNote: o.note,
    } satisfies Screen;
  });
}
