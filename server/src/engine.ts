import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFile, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";
import { BOT_MOVE_TIME_MS, type BotLevel } from "../../shared/games.js";
import { env } from "./env.js";

/**
 * The computer's moves for the games played through the API, where there is no
 * browser to run the engine. It is the same Stockfish.js file the app loads
 * (`public/engine/`), which speaks UCI over stdin and stdout when Node runs it
 * as a script, in a child process of its own so a search never blocks a
 * request. One process serves every game, one search at a time, and stops
 * after a while without work.
 */

const ENGINE = "stockfish-19-lite-single";
/** A search that takes longer than this is stuck: the process is killed and the next search starts a fresh one. */
const SEARCH_TIMEOUT_MS = 15_000;
const IDLE_MS = 10 * 60 * 1000;

/**
 * The script decides between Node and a Web Worker by its own module system,
 * and the repository's `"type": "module"` would make Node load it as ESM. A
 * copy named `.cjs`, next to its `.wasm` under the same base name (which is
 * how the script finds it), runs as published.
 */
let prepared: Promise<string> | null = null;
function scriptPath(): Promise<string> {
  prepared ??= (async () => {
    const from = [path.join(env.staticDir, "engine"), path.resolve("public/engine")].find((dir) => existsSync(path.join(dir, `${ENGINE}.js`)));
    if (!from) throw new Error(`${ENGINE}.js not found in ${env.staticDir}/engine or public/engine`);
    const dir = await mkdtemp(path.join(tmpdir(), "lance-engine-"));
    await copyFile(path.join(from, `${ENGINE}.js`), path.join(dir, `${ENGINE}.cjs`));
    await copyFile(path.join(from, `${ENGINE}.wasm`), path.join(dir, `${ENGINE}.wasm`));
    return path.join(dir, `${ENGINE}.cjs`);
  })().catch((error) => {
    prepared = null;
    throw error;
  });
  return prepared;
}

interface Running {
  child: ChildProcessWithoutNullStreams;
  waiter: { match: (line: string) => boolean; resolve: (line: string) => void; reject: (e: Error) => void } | null;
}

let running: Running | null = null;
let chain: Promise<unknown> = Promise.resolve();
let idle: NodeJS.Timeout | null = null;

function stop(reason: Error) {
  const r = running;
  running = null;
  if (!r) return;
  r.waiter?.reject(reason);
  r.child.kill();
}

async function engine(): Promise<Running> {
  if (running) return running;
  const child = spawn(process.execPath, [await scriptPath()], { stdio: ["pipe", "pipe", "pipe"] });
  const r: Running = { child, waiter: null };
  running = r;
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (r.waiter?.match(line)) {
      const w = r.waiter;
      r.waiter = null;
      w.resolve(line);
    }
  });
  child.stderr.resume();
  child.on("exit", () => {
    if (running === r) running = null;
    r.waiter?.reject(new Error("engine exited"));
  });
  child.on("error", () => {
    if (running === r) running = null;
    r.waiter?.reject(new Error("engine failed to start"));
  });
  await ask(r, ["uci"], (l) => l === "uciok");
  return r;
}

function ask(r: Running, commands: string[], match: (line: string) => boolean): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => stop(new Error("engine timed out")), SEARCH_TIMEOUT_MS);
    r.waiter = {
      match,
      resolve: (line) => {
        clearTimeout(timer);
        resolve(line);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    };
    for (const command of commands) r.child.stdin.write(`${command}\n`);
  });
}

async function search(moves: string[], level: BotLevel): Promise<string> {
  const r = await engine();
  const strength = level.elo
    ? ["setoption name UCI_LimitStrength value true", `setoption name UCI_Elo value ${level.elo}`]
    : ["setoption name UCI_LimitStrength value false", "setoption name Skill Level value 0"];
  const go = level.elo ? `go movetime ${BOT_MOVE_TIME_MS}` : `go depth ${level.depth ?? 1}`;
  const line = await ask(r, [...strength, moves.length ? `position startpos moves ${moves.join(" ")}` : "position startpos", go], (l) =>
    l.startsWith("bestmove"),
  );
  const best = line.split(" ")[1];
  if (!best || best === "(none)") throw new Error("no move");
  return best;
}

/**
 * The computer's move after these UCI moves, at this level, in UCI: now and
 * then a random legal move on the weak levels, as in the app, the engine's
 * otherwise.
 */
export function computerMove(chess: Chess, moves: string[], level: BotLevel): Promise<string> {
  if (level.randomMove > 0 && Math.random() < level.randomMove) {
    const legal = chess.moves({ verbose: true });
    if (legal.length) {
      const m = legal[Math.floor(Math.random() * legal.length)];
      return Promise.resolve(m.from + m.to + (m.promotion ?? ""));
    }
  }
  const run = chain.then(() => {
    if (idle) clearTimeout(idle);
    return search(moves, level);
  });
  chain = run
    .catch(() => undefined)
    .then(() => {
      idle = setTimeout(() => stop(new Error("engine idle")), IDLE_MS);
      idle.unref();
    });
  return run;
}
