import { Chess, type Move } from "chess.js";
import type { BoardSpec } from "@/content/types";
import { legalMoves, load, play } from "@/lib/chess/game";
import { ALL_SQUARES, FILES, type Square } from "@/lib/chess/squares";
import { pick, shuffle } from "@/lib/random";

/** True when chess.js accepts the position as a real game position. */
export function isLegalPosition(fen: string): boolean {
  try {
    new Chess(fen);
  } catch {
    return false;
  }
  // chess.js does not reject a position where the side NOT to move is in check.
  const parts = fen.split(" ");
  parts[1] = parts[1] === "w" ? "b" : "w";
  parts[3] = "-";
  try {
    return !new Chess(parts.join(" "), { skipValidation: true }).isCheck();
  } catch {
    return false;
  }
}

function expandRows(fen: string): string[][] {
  return fen
    .split(" ")[0]
    .split("/")
    .map((row) => row.replace(/\d/g, (d) => ".".repeat(Number(d))).split(""));
}

function packRows(rows: string[][]): string {
  return rows.map((r) => r.join("").replace(/\.+/g, (m) => String(m.length))).join("/");
}

function mirrorSquare(sq: string): string {
  if (sq === "-") return sq;
  return `${FILES[7 - FILES.indexOf(sq[0] as (typeof FILES)[number])]}${sq[1]}`;
}

/** Mirror left to right (a-file becomes h-file). Castling rights are dropped. */
export function mirrorFiles(fen: string): string {
  const parts = fen.split(" ");
  const rows = expandRows(fen).map((r) => [...r].reverse());
  return [packRows(rows), parts[1], "-", mirrorSquare(parts[3] ?? "-"), parts[4] ?? "0", parts[5] ?? "1"].join(" ");
}

/** Swap colors and flip the board vertically: the same position seen from the other side. */
export function flipColors(fen: string): string {
  const parts = fen.split(" ");
  const rows = expandRows(fen)
    .reverse()
    .map((r) => r.map((c) => (c === "." ? c : c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())));
  const turn = parts[1] === "w" ? "b" : "w";
  const castling =
    parts[2] === "-"
      ? "-"
      : parts[2]
          .split("")
          .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
          .sort((a, b) => "KQkq".indexOf(a) - "KQkq".indexOf(b))
          .join("");
  const ep = parts[3] && parts[3] !== "-" ? `${parts[3][0]}${9 - Number(parts[3][1])}` : "-";
  return [packRows(rows), turn, castling, ep, parts[4] ?? "0", parts[5] ?? "1"].join(" ");
}

export interface VariantOptions {
  mirror?: boolean;
  flip?: boolean;
}

/** The position plus its mirror and color-flipped versions. */
export function variantsOf(fen: string, opts: VariantOptions = { mirror: true, flip: true }): string[] {
  const hasCastling = (fen.split(" ")[2] ?? "-") !== "-";
  const out = [fen];
  if (opts.mirror && !hasCastling) out.push(mirrorFiles(fen));
  if (opts.flip) out.push(flipColors(fen));
  if (opts.mirror && opts.flip && !hasCastling) out.push(flipColors(mirrorFiles(fen)));
  return out;
}

/** A random variant that still satisfies `ok` (falls back to the original). */
export function randomVariant(fen: string, ok: (f: string) => boolean = () => true, opts?: VariantOptions): string {
  for (const v of shuffle(variantsOf(fen, opts))) if (ok(v)) return v;
  return fen;
}

export function orientationOf(fen: string): "white" | "black" {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

/** Board spec seen from the side to move. */
export function boardFor(fen: string, extra: Omit<BoardSpec, "fen"> = {}): BoardSpec & { fen: string } {
  return { fen, orientation: orientationOf(fen), ...extra };
}

export function afterMove(fen: string, m: Pick<Move, "from" | "to" | "promotion">): Chess | null {
  return play(fen, { from: m.from as Square, to: m.to as Square, promotion: m.promotion })?.game ?? null;
}

export function mateMoves(fen: string): Move[] {
  return legalMoves(fen).filter((m) => afterMove(fen, m)?.isCheckmate());
}

export function stalemateMoves(fen: string): Move[] {
  return legalMoves(fen).filter((m) => afterMove(fen, m)?.isStalemate());
}

export function checkingMoves(fen: string): Move[] {
  return legalMoves(fen).filter((m) => afterMove(fen, m)?.isCheck());
}

export type Verdict = "mate" | "stalemate" | "check" | "normal";

/** What the side to move is facing. */
export function verdictOf(fen: string): Verdict {
  const g = load(fen);
  if (g.isCheckmate()) return "mate";
  if (g.isStalemate()) return "stalemate";
  if (g.isCheck()) return "check";
  return "normal";
}

/** Places kings on random empty squares until the position is legal and `ok` holds. */
export function withRandomKings(
  pieces: Partial<Record<Square, string>>,
  turn: "w" | "b",
  ok: (fen: string) => boolean = () => true,
  tries = 300,
): string | null {
  for (let i = 0; i < tries; i++) {
    const empty = ALL_SQUARES.filter((s) => !pieces[s]);
    const wk = pick(empty);
    const bk = pick(empty.filter((s) => s !== wk));
    const all = { ...pieces, [wk]: "K", [bk]: "k" } as Partial<Record<Square, string>>;
    const fen = placementToFen(all, `${turn} - - 0 1`);
    if (isLegalPosition(fen) && ok(fen)) return fen;
  }
  return null;
}

export function placementToFen(pieces: Partial<Record<Square, string>>, rest = "w - - 0 1"): string {
  const rows: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let row = "";
    for (const f of FILES) row += pieces[`${f}${r}` as Square] ?? ".";
    rows.push(row.replace(/\.+/g, (m) => String(m.length)));
  }
  return `${rows.join("/")} ${rest}`;
}
