import TRAINER from "@/content/data/trainer.json";
import type { SequenceScreen } from "@/content/types";
import { orientationOf } from "@/content/lib/positions";
import type { Square } from "@/lib/chess/squares";
import { pick } from "@/lib/random";

/** One Lichess puzzle, as in the official CC0 database. */
export interface TrainerPuzzle {
  /** Lichess puzzle id */
  i: string;
  /** Position after the opponent's first move (the puzzle start). */
  f: string;
  /** The opponent's move that sets up the puzzle (UCI). */
  l: string;
  /** Solution, player first (UCI, space separated). */
  m: string;
  /** Puzzle rating (Glicko-2 on Lichess). */
  r: number;
  /** Theme indices. */
  t: number[];
  /** Ends in mate. */
  x: number;
  /** Game path on lichess.org. */
  g: string;
  /** Opening family index or -1. */
  o: number;
}

export const THEME_KEYS = TRAINER.themes as string[];
export const OPENING_KEYS = TRAINER.openings as string[];
const PUZZLES = TRAINER.puzzles as TrainerPuzzle[];
const BY_ID = new Map(PUZZLES.map((p) => [p.i, p]));

export const THEME_LABEL: Record<string, string> = {
  opening: "Abertura",
  middlegame: "Meio-jogo",
  endgame: "Final",
  rookEndgame: "Final de torre",
  bishopEndgame: "Final de bispo",
  pawnEndgame: "Final de peões",
  knightEndgame: "Final de cavalo",
  queenEndgame: "Final de dama",
  queenRookEndgame: "Final de dama e torre",
  advancedPawn: "Peão avançado",
  attackingF2F7: "Ataque em f2/f7",
  capturingDefender: "Remoção do defensor",
  discoveredAttack: "Ataque descoberto",
  discoveredCheck: "Xeque descoberto",
  doubleCheck: "Xeque duplo",
  exposedKing: "Rei exposto",
  fork: "Garfo",
  hangingPiece: "Peça solta",
  kingsideAttack: "Ataque na ala do rei",
  pin: "Cravada",
  queensideAttack: "Ataque na ala da dama",
  sacrifice: "Sacrifício",
  skewer: "Espeto",
  trappedPiece: "Peça presa",
  attraction: "Atração",
  clearance: "Liberação",
  defensiveMove: "Lance defensivo",
  deflection: "Desvio",
  interference: "Interferência",
  intermezzo: "Lance intermediário",
  quietMove: "Lance silencioso",
  xRayAttack: "Ataque em raio X",
  zugzwang: "Zugzwang",
  collinearMove: "Lance colinear",
  mate: "Xeque-mate",
  mateIn1: "Mate em 1",
  mateIn2: "Mate em 2",
  mateIn3: "Mate em 3",
  mateIn4: "Mate em 4",
  mateIn5: "Mate em 5 ou mais",
  anastasiaMate: "Mate de Anastasia",
  arabianMate: "Mate árabe",
  backRankMate: "Mate do corredor",
  bodenMate: "Mate de Boden",
  doubleBishopMate: "Mate com dois bispos",
  dovetailMate: "Mate de Cozio",
  hookMate: "Mate do gancho",
  killBoxMate: "Mate da caixa",
  vukovicMate: "Mate de Vukovic",
  smotheredMate: "Mate sufocado",
  epauletteMate: "Mate das dragonas",
  cornerMate: "Mate no canto",
  triangleMate: "Mate do triângulo",
  balestraMate: "Mate balestra",
  blindSwineMate: "Mate dos porcos cegos",
  morphysMate: "Mate de Morphy",
  operaMate: "Mate da ópera",
  pillsburysMate: "Mate de Pillsbury",
  swallowstailMate: "Mate cauda de andorinha",
  castling: "Roque",
  enPassant: "En passant",
  promotion: "Promoção",
  underPromotion: "Subpromoção",
  equality: "Igualar",
  advantage: "Vantagem",
  crushing: "Vantagem decisiva",
  oneMove: "Um lance",
  short: "Curto",
  long: "Longo",
  veryLong: "Muito longo",
  master: "Partidas de mestres",
  masterVsMaster: "Mestre contra mestre",
  superGM: "Super GMs",
};

/** Same groups as the Lichess themes page. */
export const THEME_GROUPS: { title: string; keys: string[] }[] = [
  { title: "Fases", keys: ["opening", "middlegame", "endgame", "rookEndgame", "bishopEndgame", "pawnEndgame", "knightEndgame", "queenEndgame", "queenRookEndgame"] },
  {
    title: "Motivos",
    keys: ["advancedPawn", "attackingF2F7", "capturingDefender", "discoveredAttack", "discoveredCheck", "doubleCheck", "exposedKing", "fork", "hangingPiece", "kingsideAttack", "pin", "queensideAttack", "sacrifice", "skewer", "trappedPiece"],
  },
  { title: "Avançados", keys: ["attraction", "clearance", "defensiveMove", "deflection", "interference", "intermezzo", "quietMove", "xRayAttack", "zugzwang", "collinearMove"] },
  {
    title: "Mates",
    keys: [
      "mate", "mateIn1", "mateIn2", "mateIn3", "mateIn4", "mateIn5", "backRankMate", "smotheredMate", "anastasiaMate", "arabianMate", "bodenMate", "doubleBishopMate",
      "dovetailMate", "hookMate", "killBoxMate", "vukovicMate", "epauletteMate", "cornerMate", "triangleMate", "balestraMate", "blindSwineMate", "morphysMate",
      "operaMate", "pillsburysMate", "swallowstailMate",
    ],
  },
  { title: "Lances especiais", keys: ["castling", "enPassant", "promotion", "underPromotion"] },
  { title: "Objetivos", keys: ["equality", "advantage", "crushing"] },
  { title: "Tamanho", keys: ["oneMove", "short", "long", "veryLong"] },
  { title: "Origem", keys: ["master", "masterVsMaster", "superGM"] },
];

export function themeLabel(key: string): string {
  return THEME_LABEL[key] ?? key;
}

export function openingLabel(key: string): string {
  return key.replace(/_/g, " ");
}

/** Filter: a theme key, an opening ("o:Sicilian_Defense"), or null for all. */
export type TrainerFilter = string | null;

function matches(p: TrainerPuzzle, filter: TrainerFilter): boolean {
  if (!filter) return true;
  if (filter.startsWith("o:")) return p.o >= 0 && OPENING_KEYS[p.o] === filter.slice(2);
  const idx = THEME_KEYS.indexOf(filter);
  return idx >= 0 && p.t.includes(idx);
}

export function countFor(filter: TrainerFilter): number {
  return PUZZLES.filter((p) => matches(p, filter)).length;
}

export function filterLabel(filter: TrainerFilter): string {
  if (!filter) return "Todos os temas";
  if (filter.startsWith("o:")) return openingLabel(filter.slice(2));
  return themeLabel(filter);
}

export function topOpenings(n: number): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of PUZZLES) if (p.o >= 0) counts.set(OPENING_KEYS[p.o], (counts.get(OPENING_KEYS[p.o]) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/** A puzzle near the player's rating, avoiding recently seen ones. */
export function pickPuzzle(filter: TrainerFilter, rating: number, recent: string[]): TrainerPuzzle {
  const pool = PUZZLES.filter((p) => matches(p, filter));
  const fresh = pool.filter((p) => !recent.includes(p.i));
  const source = fresh.length ? fresh : pool;
  for (let width = 75; width <= 2500; width += 75) {
    const near = source.filter((p) => Math.abs(p.r - rating) <= width);
    if (near.length >= 5 || width >= 2500) return pick(near.length ? near : source);
  }
  return pick(source);
}

export function puzzleById(id: string): TrainerPuzzle | undefined {
  return BY_ID.get(id);
}

export function themesOf(p: TrainerPuzzle): string[] {
  return p.t.map((t) => THEME_KEYS[t]);
}

/** Lichess-style puzzle screen: "Find the best move for white/black". */
export function puzzleScreen(p: TrainerPuzzle): SequenceScreen {
  const line = p.m.split(" ");
  const side = p.f.split(" ")[1] === "w" ? "as brancas" : "as pretas";
  return {
    kind: "sequence",
    key: `treino:${p.i}`,
    prompt: `Encontre o melhor lance para ${side}.`,
    board: {
      fen: p.f,
      orientation: orientationOf(p.f),
      lastMove: [p.l.slice(0, 2) as Square, p.l.slice(2, 4) as Square],
    },
    line,
    anyMateAtEnd: p.x === 1,
    wrong: (m) => `\`${m.san}\` não é o lance. Tente outro.`,
    success: "",
    mistakeNote: "Puzzle",
  };
}
