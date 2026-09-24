/* Builds every lesson many times and checks each generated screen.
 * Run: pnpm validate */
import { CURRICULUM } from "@/content/curriculum";
import type { BoardSpec, Screen } from "@/content/types";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";
import { Chess } from "chess.js";
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

if (errors.length) {
  console.error(`\n${errors.length} problema(s):`);
  for (const e of [...new Set(errors)].slice(0, 60)) console.error(" - " + e);
  process.exit(1);
}
console.log(`\nOK: ${lessons} lições validadas (${RUNS} construções cada).`);
