import { legalMoves, uciOf } from "@/lib/chess/game";
import type { BotLevel } from "@/lib/engine/levels";
import { pick } from "@/lib/random";

/**
 * Stockfish 19, lite single-threaded build from Stockfish.js (GPL-3.0,
 * https://github.com/nmrugg/stockfish.js), copied as-is into `public/engine/`.
 * The single-threaded build needs no cross-origin isolation headers, and the
 * lite network keeps it at about 1.8 MB. The script finds its `.wasm` by its
 * own name, so both files keep the names they were published with.
 */
export const ENGINE_URL = "/engine/stockfish-19-lite-single.js";

/** Time the limited-strength levels think per move. */
const MOVE_TIME_MS = 700;

/** Time the full-strength engine gets for the assisted game's hint. */
const HINT_TIME_MS = 800;

/** One Stockfish in a Web Worker, spoken to over UCI. */
export class Engine {
  private worker: Worker;
  private waiters: { match: (line: string) => boolean; resolve: (line: string) => void; reject: (e: Error) => void }[] = [];
  private failed: Error | null = null;
  // Searches run one at a time: Stockfish.js takes a `position` sent during a
  // search at once, and that corrupts the running one ("unreachable").
  private chain: Promise<unknown> = Promise.resolve();
  private searching = false;
  /** Every line of the running search, for the score in its `info` lines. */
  private onLine: ((line: string) => void) | null = null;

  constructor(url = ENGINE_URL) {
    this.worker = new Worker(url);
    this.worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data);
      this.onLine?.(line);
      const i = this.waiters.findIndex((w) => w.match(line));
      if (i >= 0) this.waiters.splice(i, 1)[0].resolve(line);
    };
    this.worker.onerror = () => {
      this.failed = new Error("engine failed");
      for (const w of this.waiters.splice(0)) w.reject(this.failed);
    };
  }

  private send(cmd: string): void {
    this.worker.postMessage(cmd);
  }

  private waitFor(match: (line: string) => boolean): Promise<string> {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => this.waiters.push({ match, resolve, reject }));
  }

  /** Loads the engine and sets its strength for a new game; null is full strength. */
  async start(level: BotLevel | null): Promise<void> {
    const uciok = this.waitFor((l) => l === "uciok");
    this.send("uci");
    await uciok;
    if (!level) {
      // Full strength is the default.
    } else if (level.elo) {
      this.send("setoption name UCI_LimitStrength value true");
      this.send(`setoption name UCI_Elo value ${level.elo}`);
    } else {
      this.send("setoption name Skill Level value 0");
    }
    this.send("ucinewgame");
    const ready = this.waitFor((l) => l === "readyok");
    this.send("isready");
    await ready;
  }

  /**
   * The engine's move after these moves from the initial position, in UCI
   * (`e2e4`, `e7e8q`). The whole line goes over, not just the position, so the
   * engine sees repetitions too.
   */
  bestMove(moves: string[], level: BotLevel | null): Promise<string> {
    const go = !level ? `go movetime ${HINT_TIME_MS}` : level.elo ? `go movetime ${MOVE_TIME_MS}` : `go depth ${level.depth ?? 1}`;
    return this.queue(moves, go).then((r) => r.best);
  }

  /**
   * The engine's evaluation of the position after these moves, searched for
   * `ms`, from the side to move: centipawns or a mate in so many moves
   * (negative when the side to move gets mated), and its best move there.
   */
  evaluate(moves: string[], ms: number): Promise<{ score: { cp: number } | { mate: number }; best: string; pv: string[] }> {
    return this.queue(moves, `go movetime ${ms}`).then((r) => {
      if (!r.score) throw new Error("no score");
      return { score: r.score, best: r.best, pv: r.pv };
    });
  }

  private queue(moves: string[], go: string) {
    // A newer question makes the one still being searched moot: cut it short.
    if (this.searching) this.send("stop");
    const run = this.chain.then(() => this.search(moves, go));
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async search(moves: string[], go: string): Promise<{ best: string; score: { cp: number } | { mate: number } | null; pv: string[] }> {
    this.searching = true;
    let score: { cp: number } | { mate: number } | null = null;
    let pv: string[] = [];
    // The last full score wins, with the line it came with: each `info` line
    // is a deeper search than the one before.
    this.onLine = (line) => {
      const m = /^info .*\bscore (cp|mate) (-?\d+)\b(?! (?:lower|upper)bound)/.exec(line);
      if (!m) return;
      score = m[1] === "cp" ? { cp: Number(m[2]) } : { mate: Number(m[2]) };
      pv = / pv (.+)$/.exec(line)?.[1].trim().split(/\s+/) ?? [];
    };
    try {
      const done = this.waitFor((l) => l.startsWith("bestmove"));
      this.send(moves.length ? `position startpos moves ${moves.join(" ")}` : "position startpos");
      this.send(go);
      return { best: (await done).split(" ")[1], score, pv };
    } finally {
      this.onLine = null;
      this.searching = false;
    }
  }

  dispose(): void {
    for (const w of this.waiters.splice(0)) w.reject(new Error("engine closed"));
    this.worker.terminate();
  }
}

/** The computer's move: now and then a random one on the weak levels, the engine's otherwise. */
export async function botMove(engine: Engine, fen: string, moves: string[], level: BotLevel): Promise<string> {
  if (level.randomMove > 0 && Math.random() < level.randomMove) {
    const legal = legalMoves(fen);
    if (legal.length) return uciOf(pick(legal));
  }
  return engine.bestMove(moves, level);
}
