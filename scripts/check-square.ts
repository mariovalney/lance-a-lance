/* Brute-force check of the square rule used in lesson 11.1. */
import { Chess } from "chess.js";
import { lessonQuadrado } from "@/content/lessons/m11-finais";

function blackStops(g: Chess, depth: number): boolean {
  // black to move
  const pawnSq = g.board().flat().find((p) => p?.type === "p" && p.color === "w");
  if (!pawnSq) return true; // pawn captured
  if (depth === 0) return false;
  for (const m of g.moves({ verbose: true })) {
    g.move(m);
    let ok: boolean;
    const pawn = g.board().flat().find((p) => p?.type === "p" && p.color === "w");
    if (!pawn) ok = true;
    else {
      const push = g.moves({ verbose: true }).find((x) => x.piece === "p");
      if (!push) ok = true; // blocked
      else {
        g.move({ from: push.from, to: push.to, promotion: "q" });
        if (push.promotion) {
          // black may capture the queen at once
          ok = g.moves({ verbose: true }).some((x) => x.to === push.to && x.captured === "q");
        } else ok = blackStops(g, depth - 1);
        g.undo();
      }
    }
    g.undo();
    if (ok) return true;
  }
  return false;
}

let bad = 0;
let n = 0;
for (let i = 0; i < 150; i++) {
  for (const s of lessonQuadrado.build()) {
    if (s.kind !== "choice") continue;
    n++;
    const g = new Chess(s.board!.fen!, { skipValidation: true });
    const truth = blackStops(g, 7);
    if ((s.correct === "sim") !== truth) {
      bad++;
      if (bad < 5) console.log("mismatch", s.board!.fen, s.correct, truth);
    }
  }
}
console.log("checked", n, "mismatches", bad);
