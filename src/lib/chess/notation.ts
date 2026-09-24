import type { Move, PieceSymbol } from "chess.js";

export const PIECE_NAME: Record<PieceSymbol, string> = {
  p: "peão",
  n: "cavalo",
  b: "bispo",
  r: "torre",
  q: "dama",
  k: "rei",
};

/**
 * International notation (SAN, English letters) followed by a plain
 * Portuguese reading in parentheses, e.g. "Nf3 (cavalo para f3)".
 */
export function describeMove(move: Pick<Move, "san" | "piece" | "to" | "flags" | "promotion" | "captured">): string {
  return `${move.san} (${readMove(move)})`;
}

export function readMove(move: Pick<Move, "san" | "piece" | "to" | "flags" | "promotion" | "captured">): string {
  let text: string;
  if (move.flags.includes("k")) {
    text = "roque pequeno";
  } else if (move.flags.includes("q")) {
    text = "roque grande";
  } else {
    const piece = withOrigin(PIECE_NAME[move.piece], move.san);
    const capture = Boolean(move.captured);
    if (move.flags.includes("e")) {
      text = `peão captura en passant em ${move.to}`;
    } else if (move.promotion) {
      const promo = PIECE_NAME[move.promotion];
      text = capture
        ? `peão captura em ${move.to} e vira ${promo}`
        : `peão vira ${promo} em ${move.to}`;
    } else {
      text = capture ? `${piece} captura em ${move.to}` : `${piece} para ${move.to}`;
    }
  }
  if (move.san.endsWith("#")) text += ", xeque-mate";
  else if (move.san.endsWith("+")) text += ", xeque";
  return text;
}

/**
 * When two equal pieces can reach the same square, SAN adds the origin file,
 * rank or square (Nbd2, R1e2, Qh4e1). The reading names it too.
 */
function withOrigin(piece: string, san: string): string {
  const m = /^[KQRBN]([a-h]?[1-8]?)x?[a-h][1-8]/.exec(san);
  const origin = m?.[1] ?? "";
  if (!origin) return piece;
  if (origin.length === 2) return `${piece} de ${origin}`;
  return /[a-h]/.test(origin) ? `${piece} da coluna ${origin}` : `${piece} da fileira ${origin}`;
}

/** SAN without the origin hint: "Nbd2" -> "Nd2". */
export function withoutOrigin(san: string): string {
  return san.replace(/^([KQRBN])[a-h]?[1-8]?(x?[a-h][1-8])/, "$1$2");
}
