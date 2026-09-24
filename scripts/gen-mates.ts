/* Generates verified mate positions for Module 5. Run: npx tsx scripts/gen-mates.ts */
import { writeFileSync } from "node:fs";
import { isLegalPosition, placementToFen, mateMoves } from "@/content/lib/positions";
import { load } from "@/lib/chess/game";
import { forcedMate } from "@/lib/chess/search";
import { ALL_SQUARES, type Square } from "@/lib/chess/squares";
import { pick } from "@/lib/random";

const EDGE = ALL_SQUARES.filter((s) => s[0] === "a" || s[0] === "h" || s[1] === "1" || s[1] === "8");
const dist = (a: string, b: string) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));

function sample(pieces: string[], opts: { bkEdge: boolean; wkNear: number }): string | null {
  const bk = pick(opts.bkEdge ? EDGE : ALL_SQUARES);
  const wkChoices = ALL_SQUARES.filter((s) => dist(s, bk) >= 2 && dist(s, bk) <= opts.wkNear);
  const wk = pick(wkChoices);
  const placed: Partial<Record<Square, string>> = { [bk]: "k", [wk]: "K" };
  for (const p of pieces) {
    const sq = pick(ALL_SQUARES.filter((s) => !placed[s]));
    placed[sq] = p;
  }
  const fen = placementToFen(placed, "w - - 0 1");
  if (!isLegalPosition(fen)) return null;
  const g = load(fen);
  if (g.isGameOver()) return null;
  // Black must have moves if it were black's turn (not a stalemate-like cage already).
  return fen;
}

function collect(label: string, pieces: string[], depth: number, count: number, opts: { bkEdge: boolean; wkNear: number }) {
  const out = new Set<string>();
  let tries = 0;
  const t0 = Date.now();
  while (out.size < count && tries < 200000) {
    tries++;
    const fen = sample(pieces, opts);
    if (!fen) continue;
    if (depth === 1) {
      if (mateMoves(fen).length > 0) out.add(fen);
      continue;
    }
    if (mateMoves(fen).length > 0) continue; // want exactly mate in `depth`
    if (forcedMate(fen, depth)) out.add(fen);
  }
  console.log(`${label}: ${out.size} in ${tries} tries, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return [...out];
}

const data = {
  kq1: collect("kq1", ["Q"], 1, 30, { bkEdge: true, wkNear: 3 }),
  kr1: collect("kr1", ["R"], 1, 30, { bkEdge: true, wkNear: 3 }),
  krr1: collect("krr1", ["R", "R"], 1, 20, { bkEdge: true, wkNear: 7 }),
  kq2: collect("kq2", ["Q"], 2, 24, { bkEdge: true, wkNear: 3 }),
  krr2: collect("krr2", ["R", "R"], 2, 24, { bkEdge: true, wkNear: 7 }),
  kr2: collect("kr2", ["R"], 2, 24, { bkEdge: true, wkNear: 3 }),
};
writeFileSync("src/content/data/mates.json", JSON.stringify(data, null, 1));
console.log("written");
