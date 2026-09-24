/* Builds the trainer set from a Lichess-faithful sample: all themes, openings and game links. */
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

interface Raw { id: string; fen: string; moves: string[]; rating: number; themes: string[]; pop: number; plays: number; game: string; opening: string }
const raw = JSON.parse(readFileSync(process.env.RAW ?? "data/puzzles_all.json", "utf8")) as Raw[];

const themeSet = new Map<string, number>();
const openingSet = new Map<string, number>();
const idxOf = (map: Map<string, number>, k: string) => {
  if (!map.has(k)) map.set(k, map.size);
  return map.get(k)!;
};

const puzzles: { i: string; f: string; l: string; m: string; r: number; t: number[]; x: number; g: string; o: number }[] = [];
for (const p of raw) {
  try {
    const g = new Chess(p.fen);
    const u = (m: string) => ({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: (m[4] as never) || undefined });
    g.move(u(p.moves[0]));
    const start = g.fen();
    for (const m of p.moves.slice(1)) g.move(u(m));
    const family = p.opening.split(" ")[0];
    puzzles.push({
      i: p.id,
      f: start,
      l: p.moves[0],
      m: p.moves.slice(1).join(" "),
      r: p.rating,
      t: p.themes.map((t) => idxOf(themeSet, t)),
      x: g.isCheckmate() ? 1 : 0,
      g: p.game.replace("https://lichess.org/", ""),
      o: family ? idxOf(openingSet, family) : -1,
    });
  } catch {
    /* skip broken rows */
  }
}
puzzles.sort((a, b) => a.r - b.r);
const out = { themes: [...themeSet.keys()], openings: [...openingSet.keys()], puzzles };
writeFileSync("src/content/data/trainer.json", JSON.stringify(out));
console.log("puzzles", puzzles.length, "themes", out.themes.length, "openings", out.openings.length, "bytes", JSON.stringify(out).length);
