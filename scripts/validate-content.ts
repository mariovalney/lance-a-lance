/* Builds every lesson many times and checks each generated screen.
 * Run: pnpm validate */
import { CURRICULUM } from "@/content/curriculum";
import type { BoardSpec, Screen } from "@/content/types";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";
import { isLegalPosition } from "@/content/lib/positions";
import { validateScreen as validateMoveScreen } from "./validate-moves";

const RUNS = Number(process.env.RUNS ?? 40);
const errors: string[] = [];
const isSquare = (s: string) => (ALL_SQUARES as string[]).includes(s);

function checkRich(where: string, text: string | undefined) {
  if (!text) return;
  const ticks = (text.match(/`/g) ?? []).length;
  if (ticks % 2) errors.push(`${where}: unbalanced backticks in "${text}"`);
  const bold = (text.match(/\*\*/g) ?? []).length;
  if (bold % 2) errors.push(`${where}: unbalanced ** in "${text}"`);
  if (/\u2014|\u2013/.test(text)) errors.push(`${where}: dash character in "${text}"`);
}

function checkFen(where: string, fen: string) {
  const rows = fen.split(" ")[0].split("/");
  if (rows.length !== 8) errors.push(`${where}: FEN must have 8 rows: ${fen}`);
  rows.forEach((row, i) => {
    let n = 0;
    for (const ch of row) n += /\d/.test(ch) ? Number(ch) : /[pnbrqkPNBRQK]/.test(ch) ? 1 : 99;
    if (n !== 8) errors.push(`${where}: FEN row ${i + 1} has ${n} squares: ${fen}`);
  });
}

function checkBoard(where: string, b: BoardSpec | undefined) {
  if (!b) return;
  if (b.fen) checkFen(where, b.fen);
  for (const sq of Object.keys(b.marks ?? {})) if (!isSquare(sq)) errors.push(`${where}: bad mark square ${sq}`);
  for (const sq of Object.keys(b.labels ?? {})) if (!isSquare(sq)) errors.push(`${where}: bad label square ${sq}`);
  for (const a of b.arrows ?? []) if (!isSquare(a.from) || !isSquare(a.to)) errors.push(`${where}: bad arrow ${a.from}-${a.to}`);
}

function checkScreen(where: string, s: Screen) {
  switch (s.kind) {
    case "explain":
      if (!s.title || !s.text) errors.push(`${where}: explain needs title and text`);
      checkRich(where, s.text);
      checkRich(where, s.tip);
      checkBoard(where, s.board);
      return;
    case "tap": {
      checkRich(where, s.prompt);
      checkRich(where, s.success);
      checkBoard(where, s.board);
      if (!s.targets.length || !s.targets.every(isSquare)) errors.push(`${where}: bad targets ${s.targets}`);
      const other = ALL_SQUARES.find((q) => !s.targets.includes(q as Square));
      if (other) checkRich(where, s.wrong(other as Square));
      return;
    }
    case "tapAll": {
      checkRich(where, s.prompt);
      checkBoard(where, s.board);
      if (!s.targets.length || !s.targets.every(isSquare)) errors.push(`${where}: bad targets ${s.targets}`);
      const other = ALL_SQUARES.find((q) => !s.targets.includes(q as Square));
      if (other) checkRich(where, s.wrong(other as Square));
      return;
    }
    case "choice": {
      for (const b of [s.board, s.revealBoard]) {
        const pf = b?.fen?.split(" ")[0];
        if (b?.fen && pf!.includes("K") && pf!.includes("k")) {
          if (!isLegalPosition(b.fen)) errors.push(`${where}: illegal position ${b.fen}`);
        }
      }
      checkRich(where, s.prompt);
      checkRich(where, s.explain);
      checkBoard(where, s.board);
      checkBoard(where, s.revealBoard);
      const ids = s.options.map((o) => o.id);
      const labels = s.options.map((o) => o.label);
      if (new Set(ids).size !== ids.length) errors.push(`${where}: duplicate option ids ${ids}`);
      if (new Set(labels).size !== labels.length) errors.push(`${where}: duplicate option labels ${labels}`);
      if (!ids.includes(s.correct)) errors.push(`${where}: correct "${s.correct}" not in options ${ids}`);
      if (ids.length < 2) errors.push(`${where}: needs 2+ options`);
      if (!s.board && !s.hideBoardUntilAnswered && !s.revealBoard) {
        /* text-only question: fine */
      }
      return;
    }
    case "drill":
      if (s.durationSec <= 0 || s.target <= 0) errors.push(`${where}: bad drill config`);
      return;
    default:
      validateMoveScreen(where, s as never, errors);
  }
}

let lessons = 0;
for (const mod of CURRICULUM) {
  for (const meta of mod.lessons) {
    if (!meta.lesson) continue;
    if (process.env.ONLY && !meta.id.startsWith(process.env.ONLY)) continue;
    lessons++;
    const keys = new Set<string>();
    let screens = 0;
    let exercises = 0;
    for (let run = 0; run < RUNS; run++) {
      let built: Screen[];
      try {
        built = meta.lesson.build();
      } catch (e) {
        errors.push(`${meta.id}: build() threw ${(e as Error).message}`);
        continue;
      }
      if (run === 0) {
        screens = built.length;
        exercises = built.filter((s) => s.kind !== "explain").length;
        if (built[0]?.kind !== "explain") errors.push(`${meta.id}: first screen should explain`);
      }
      built.forEach((s, i) => {
        const where = `${meta.id}#${i}(${s.kind})`;
        try {
          checkScreen(where, s);
        } catch (e) {
          errors.push(`${where}: check threw ${(e as Error).message}`);
        }
        if ("key" in s) keys.add(s.key);
      });
    }
    console.log(`${meta.id.padEnd(7)} ${String(screens).padStart(3)} telas, ${String(exercises).padStart(2)} exercícios, ${keys.size} variações  ${meta.title}`);
  }
}

if (!process.env.ONLY || process.env.ONLY === "treino") {
  const TR = (await import("@/lib/trainer")) as typeof import("@/lib/trainer");
  const data = (await import("@/content/data/trainer.json")).default as { puzzles: import("@/lib/trainer").TrainerPuzzle[] };
  for (const p of data.puzzles) checkScreen(`treino:${p.i}`, TR.puzzleScreen(p));
  console.log(`treino: ${data.puzzles.length} puzzles checados`);
}

if (!process.env.ONLY || process.env.ONLY === "analise") {
  // The sentences under a judged move, from hand-written analyses, so the rule
  // is checked without depending on the engine's timing.
  const { explainMove } = await import("@/lib/chess/explain");
  const { MAX_CP } = await import("@shared/analysis");
  type Eval = import("@shared/types").PositionEval;
  const cp = (v: number, pv: string[]): Eval => ({ cp: v, best: pv[0] ?? null, pv });
  const game = (moves: string[], analysis: Eval[]) =>
    ({ id: "x", level: 800, player: "w", assisted: false, moves, outcome: "loss", reason: "resigned", ratingDelta: null, ratingAfter: null, xp: 0, startedAt: "", finishedAt: "", analysis }) as import("@shared/types").Game;
  const opening = [cp(20, ["e2e4"]), cp(30, ["e7e5"]), cp(30, ["g1f3"]), cp(40, ["d7d6"]), cp(40, ["d2d4", "e5d4", "f3d4"])];
  const cases: { name: string; game: import("@shared/types").Game; ply: number; expected: string | null }[] = [
    {
      name: "mate de dois lances",
      game: game(["f2f3", "e7e5", "g2g4", "d8h4"], [cp(20, ["e2e4"]), cp(-50, ["e7e5"]), cp(-60, ["e2e4"]), { mate: -1, best: "d8h4", pv: ["d8h4"] }, { cp: -MAX_CP, best: null }]),
      ply: 3,
      expected: "Depois de g4, o computador pode dar xeque-mate no lance seguinte.",
    },
    {
      name: "dar mate não é erro",
      game: game(["f2f3", "e7e5", "g2g4", "d8h4"], [cp(20, ["e2e4"]), cp(-50, ["e7e5"]), cp(-60, ["e2e4"]), { mate: -1, best: "d8h4", pv: ["d8h4"] }, { cp: -MAX_CP, best: null }]),
      ply: 4,
      expected: null,
    },
    {
      name: "cavalo pendurado",
      game: game(["e2e4", "e7e5", "g1f3", "d7d6", "f3g5"], [...opening, cp(-300, ["d8g5", "d2d4", "g5g6"])]),
      ply: 5,
      expected: "Com Ng5, você perde um cavalo.",
    },
    {
      // The engine's own line: a queen trade cut off by the end of the line
      // (Qxd8, the recapture past it) must not read as material won.
      name: "troca cortada no fim da linha",
      game: game(
        ["e2e4", "e7e5", "g1f3", "d7d6", "f3g5"],
        [...opening.slice(0, 4), cp(61, ["d2d4", "e5d4", "f3d4", "g8f6", "b1c3", "g7g6", "c1e3", "f6g4"]), cp(-545, ["d8g5", "d2d4", "g5d8", "b1c3", "g8f6", "d4e5", "d6e5", "d1d8"])],
      ),
      ply: 5,
      expected: "Com Ng5, você perde um cavalo.",
    },
    {
      // The best line loses something too: the sentence counts only what is worse.
      name: "perde mais do que o melhor lance",
      game: game(
        ["e2e4", "e7e5", "g1f3", "d7d6", "f3g5"],
        [...opening.slice(0, 4), cp(40, ["f3e5", "d6e5", "f1c4"]), cp(-300, ["d8g5", "d2d4", "g5g2", "h1g1", "g2h3"])],
      ),
      ply: 5,
      expected: "Com Ng5, você perde um peão a mais do que com Nxe5 e deixa de ganhar um peão.",
    },
    {
      name: "peça de graça ignorada",
      game: game(["e2e4", "e7e5", "g1f3", "d7d6", "f3g5", "h7h6"], [...opening, cp(-300, ["d8g5", "d2d4", "g5g6"]), cp(-150, ["g5f3", "g8f6"])]),
      ply: 6,
      expected: "Com h6, o computador deixa de ganhar um cavalo.",
    },
    {
      // Two searches that disagree must not mark the engine's own move.
      name: "o lance do motor não é erro",
      game: game(["e2e4", "e7e5", "g1f3"], [cp(20, ["e2e4"]), cp(30, ["e7e5"]), cp(30, ["g1f3", "b8c6"]), cp(-400, ["b8c6"])]),
      ply: 3,
      expected: null,
    },
    {
      name: "imprecisão sem material",
      game: game(["e2e4", "e7e5", "a2a3"], [cp(20, ["e2e4"]), cp(30, ["e7e5"]), cp(30, ["g1f3", "b8c6"]), cp(-40, ["g8f6", "b1c3"])]),
      ply: 3,
      expected: null,
    },
  ];
  // The assisted game's reason for the best move, from its line and its score.
  const { explainBest } = await import("@/lib/chess/explain");
  const { replay } = await import("@shared/games");
  const afterNg5 = replay(["e2e4", "e7e5", "g1f3", "d7d6", "f3g5"])!.fen();
  const bestCases: { name: string; got: string | null; expected: string | null }[] = [
    { name: "peça de graça", got: explainBest(afterNg5, ["d8g5", "d2d4", "g5g6"], { cp: 300 }, "b"), expected: "Ganha um cavalo." },
    { name: "mate em 1", got: explainBest(afterNg5, ["d8g5"], { mate: 1 }, "b"), expected: "Dá xeque-mate." },
    { name: "mate em 3", got: explainBest(afterNg5, ["d8g5"], { mate: 3 }, "b"), expected: "Leva a xeque-mate em 3 lances." },
    { name: "lance quieto", got: explainBest(afterNg5, ["h7h6", "g5f3"], { cp: 20 }, "b"), expected: null },
  ];
  for (const c of bestCases) {
    if (c.got !== c.expected) errors.push(`melhor lance (${c.name}): esperava ${JSON.stringify(c.expected)}, veio ${JSON.stringify(c.got)}`);
  }
  console.log(`melhor lance: ${bestCases.length} casos checados`);

  // Mário's game, 25. Kf2??: the engine's own evaluations and lines. Kf1 also
  // loses both rooks but wins the bishop back; Kf2 lets Black force a draw.
  {
    const { Chess } = await import("chess.js");
    const san = "d4 Nf6 Nc3 e6 e4 Bb4 a3 Ba5 e5 d5 Bb5+ Nbd7 Bg5 h6 Bh4 Kf8 exf6 Bxc3+ bxc3 Nxf6 Nf3 g5 Bg3 c6 Bd3 Qa5 Qd2 c5 Be5 c4 Bxf6 e5 Bxh8 e4 Ne5 e3 fxe3 cxd3 Qxd3 Bh3 Qh7 Ke7 Ng6+ Kd8 Qg8+ Kc7 Qxa8 Qxc3+ Kf2".split(" ");
    const chess = new Chess();
    const moves = san.map((m) => {
      const mv = chess.move(m);
      return mv.from + mv.to + (mv.promotion ?? "");
    });
    const analysis: Eval[] = moves.map(() => cp(0, []));
    analysis.push(cp(0, ["c3c2", "f2e1", "c2c3", "e1e2", "c3b2", "e2d3", "h3f5", "e3e4"]));
    analysis[48] = cp(553, ["e1f1", "c3a1", "f1e2", "a1h1", "h8e5", "c7b6", "g2h3", "f7g6"]);
    const got = explainMove(game(moves, analysis), 49);
    const expected = "Você estava ganhando, e com Kf2 o jogo fica equilibrado.";
    if (got !== expected) errors.push(`análise (Kf2 da partida): esperava ${JSON.stringify(expected)}, veio ${JSON.stringify(got)}`);
  }

  const { judgements } = await import("@shared/analysis");
  const unstable = cases.find((c) => c.name === "o lance do motor não é erro")!.game;
  if (judgements(unstable.analysis!, unstable.moves)[2] !== null) errors.push("análise: o lance do motor foi marcado");
  for (const c of cases) {
    const got = explainMove(c.game, c.ply);
    if (got !== c.expected) errors.push(`análise (${c.name}): esperava ${JSON.stringify(c.expected)}, veio ${JSON.stringify(got)}`);
  }
  console.log(`análise: ${cases.length} casos checados`);
}

if (errors.length) {
  console.error(`\n${errors.length} problema(s):`);
  for (const e of [...new Set(errors)].slice(0, 60)) console.error(" - " + e);
  process.exit(1);
}
console.log(`\nOK: ${lessons} lições validadas (${RUNS} construções cada).`);
