/* Picks beginner-friendly puzzles from the Lichess CC0 database dump (filtered raw JSON). */
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

interface Raw { id: string; fen: string; moves: string[]; rating: number; themes: string[]; pop: number; plays: number; opening: string }
const raw = JSON.parse(readFileSync(process.env.RAW ?? "data/puzzles_raw.json", "utf8")) as Record<string, Raw[]>;

const PLAN: Record<string, { count: number; maxPlies: number }> = {
  fork: { count: 45, maxPlies: 4 },
  pin: { count: 45, maxPlies: 4 },
  skewer: { count: 45, maxPlies: 4 },
  discoveredAttack: { count: 45, maxPlies: 4 },
  doubleCheck: { count: 40, maxPlies: 6 },
  capturingDefender: { count: 45, maxPlies: 4 },
  deflection: { count: 45, maxPlies: 4 },
  mateIn1: { count: 40, maxPlies: 2 },
  mateIn2: { count: 40, maxPlies: 4 },
  hangingPiece: { count: 40, maxPlies: 2 },
  backRankMate: { count: 30, maxPlies: 4 },
  pawnEndgame: { count: 40, maxPlies: 6 },
  rookEndgame: { count: 40, maxPlies: 6 },
};

const out: Record<string, { id: string; fen: string; last: string; line: string[]; rating: number; mate: boolean }[]> = {};
const used = new Set<string>();
for (const [theme, plan] of Object.entries(PLAN)) {
  const list = (raw[theme] ?? [])
    .filter((p) => p.moves.length <= plan.maxPlies && p.moves.length >= 2)
    .sort((a, b) => a.rating - b.rating || b.pop - a.pop);
  const picked = [];
  for (const p of list) {
    if (picked.length >= plan.count) break;
    if (used.has(p.id)) continue;
    const g = new Chess(p.fen);
    try {
      g.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] as never });
      const start = g.fen();
      for (const m of p.moves.slice(1)) g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] as never });
      picked.push({ id: p.id, fen: start, last: p.moves[0], line: p.moves.slice(1), rating: p.rating, mate: g.isCheckmate() });
      used.add(p.id);
    } catch {
      /* skip broken */
    }
  }
  out[theme] = picked;
  console.log(theme, picked.length, picked.length ? `${picked[0].rating}-${picked[picked.length - 1].rating}` : "");
}
writeFileSync("src/content/data/puzzles.json", JSON.stringify(out));
console.log("bytes", JSON.stringify(out).length);
