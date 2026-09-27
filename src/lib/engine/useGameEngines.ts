import { useCallback, useEffect, useMemo, useRef } from "react";
import { Engine, HINT_TIME_MS, botMove } from "@/lib/engine/stockfish";
import type { BotLevel } from "@/lib/engine/levels";

/**
 * The two Stockfish workers a game uses: the opponent, at its level, and for an
 * assisted game a full-strength one that finds the player's best move. They
 * live as long as the screen, and loading a new game replaces them.
 */
export function useGameEngines() {
  const opponent = useRef<{ engine: Engine; level: BotLevel } | null>(null);
  const helper = useRef<Engine | null>(null);

  const dispose = useCallback(() => {
    opponent.current?.engine.dispose();
    helper.current?.dispose();
    opponent.current = null;
    helper.current = null;
  }, []);

  useEffect(() => dispose, [dispose]);

  const load = useCallback(
    async (level: BotLevel, assisted: boolean) => {
      dispose();
      const engine = new Engine();
      opponent.current = { engine, level };
      helper.current = assisted ? new Engine() : null;
      await Promise.all([engine.start(level), helper.current?.start(null)]);
    },
    [dispose],
  );

  /** The opponent's move after `moves`, in UCI. */
  const reply = useCallback(async (fen: string, moves: string[]) => {
    const o = opponent.current;
    if (!o) throw new Error("no engine loaded");
    return botMove(o.engine, fen, moves, o.level);
  }, []);

  /**
   * The best move for whoever is to play after `moves`, with the line behind it
   * and its score from that side, or null without a helper.
   */
  const best = useCallback(async (moves: string[]) => (helper.current ? helper.current.evaluate(moves, HINT_TIME_MS) : null), []);

  return useMemo(() => ({ load, reply, best }), [load, reply, best]);
}
