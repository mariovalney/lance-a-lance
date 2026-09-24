import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Eye, History, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SequenceStep, type SequenceFinish } from "@/components/lesson/steps/SequenceStep";
import { useProgress } from "@/lib/progress/useProgress";
import { PROVISIONAL_GAMES, START_RATING, eloDelta } from "@/lib/progress/scoring";
import type { PuzzleLogEntry, PuzzleStatus } from "@/lib/progress/types";
import {
  OPENING_KEYS,
  THEME_GROUPS,
  countFor,
  filterLabel,
  openingLabel,
  pickPuzzle,
  puzzleById,
  puzzleScreen,
  themeLabel,
  themesOf,
  topOpenings,
  type TrainerFilter,
  type TrainerPuzzle,
} from "@/lib/trainer";
import { getSettings, updateSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

type Mode = "rated" | "practice";

interface Outcome {
  ok: boolean;
  gaveUp: boolean;
  delta: number | null;
}

export const PuzzleTrainer: FC<{ onExit: () => void }> = ({ onExit }) => {
  const { state, recordPuzzle } = useProgress();
  const stats = state.puzzles;
  const rating = stats?.rating ?? START_RATING;
  const played = stats?.played ?? 0;
  const provisional = played < PROVISIONAL_GAMES;

  const [filter, setFilter] = useState<TrainerFilter>(() => getSettings().puzzleTheme ?? null);
  const [puzzle, setPuzzle] = useState<TrainerPuzzle>(() => pickPuzzle(filter, rating, stats?.recent ?? []));
  const [mode, setMode] = useState<Mode>("rated");
  const [run, setRun] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [lastDelta, setLastDelta] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const screen = useMemo(() => puzzleScreen(puzzle), [puzzle]);

  const load = (p: TrainerPuzzle, m: Mode) => {
    setPuzzle(p);
    setMode(m);
    setOutcome(null);
    setRun((r) => r + 1);
  };

  const nextPuzzle = () => load(pickPuzzle(filter, stats?.rating ?? rating, stats?.recent ?? []), "rated");
  const retry = () => load(puzzle, "practice");

  const onFinish = useCallback(
    ({ perfect, gaveUp }: SequenceFinish) => {
      if (mode === "practice") {
        setOutcome({ ok: perfect, gaveUp, delta: null });
        return;
      }
      const delta = eloDelta(rating, puzzle.r, played, perfect);
      recordPuzzle({ id: puzzle.i, status: perfect ? "ok" : gaveUp ? "solucao" : "erro", puzzleRating: puzzle.r, points: perfect ? 10 : gaveUp ? 0 : 3 });
      setLastDelta(delta);
      setOutcome({ ok: perfect, gaveUp, delta });
    },
    [mode, rating, puzzle, played, recordPuzzle],
  );

  const chooseFilter = (f: TrainerFilter) => {
    setFilter(f);
    updateSettings({ puzzleTheme: f });
    setFiltersOpen(false);
    load(pickPuzzle(f, rating, stats?.recent ?? []), "rated");
  };

  const doneFooter = outcome ? (
    <TrainerDone puzzle={puzzle} outcome={outcome} mode={mode} onNext={nextPuzzle} onRetry={retry} />
  ) : undefined;

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="mx-auto flex w-full max-w-[30rem] items-center gap-1.5 px-2 pt-2">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={onExit} aria-label="Voltar ao início">
          <ArrowLeft className="!h-5 !w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-display text-lg font-bold leading-tight">Puzzles</span>
          <span className="text-xs text-muted-foreground">
            <span className="font-mono tabular">{stats?.solved ?? 0}</span> {(stats?.solved ?? 0) === 1 ? "resolvido" : "resolvidos"}
            {stats && stats.streak > 1 ? ` · ${stats.streak} seguidos` : ""}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full" onClick={() => setHistoryOpen(true)} aria-label="Puzzles recentes">
          <History className="!h-5 !w-5" />
        </Button>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 shadow-[0_0_0_1px_hsl(var(--border))]">
          <span className="font-mono text-base font-bold tabular">
            {rating}
            {provisional && <span className="text-muted-foreground">?</span>}
          </span>
          {lastDelta !== null && (
            <span
              key={run}
              className={cn(
                "animate-in fade-in zoom-in-90 rounded-full px-1.5 font-mono text-xs font-bold tabular duration-300",
                lastDelta >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
              )}
            >
              {lastDelta >= 0 ? `+${lastDelta}` : lastDelta}
            </span>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[30rem] items-center gap-2 px-4 pt-1.5">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-accent"
        >
          <span className="truncate">{filterLabel(filter)}</span>
          <span className="font-mono text-[11px] tabular text-muted-foreground">{countFor(filter)}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        {mode === "practice" && <span className="rounded-full bg-gold-soft px-2.5 py-1 text-xs font-semibold text-gold">Refazendo: não vale rating</span>}
      </div>

      <div key={`${puzzle.i}:${run}`} className="flex min-h-0 flex-1 flex-col">
        <SequenceStep screen={screen} onDone={() => undefined} autoAdvance={false} hintArrows={false} allowGiveUp onFinish={onFinish} doneFooter={doneFooter} />
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className="font-display">Temas</SheetTitle>
            <SheetDescription>As mesmas categorias do Lichess. O número é quantos puzzles há no app.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 py-4">
            <FilterChip active={filter === null} label="Todos os temas" count={countFor(null)} onClick={() => chooseFilter(null)} />
            {THEME_GROUPS.map((g) => (
              <div key={g.title} className="flex flex-col gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{g.title}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {g.keys
                    .map((k) => ({ k, n: countFor(k) }))
                    .filter((x) => x.n > 0)
                    .map(({ k, n }) => (
                      <FilterChip key={k} active={filter === k} label={themeLabel(k)} count={n} onClick={() => chooseFilter(k)} />
                    ))}
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-2">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Aberturas</h3>
              <div className="flex flex-wrap gap-1.5">
                {topOpenings(24).map(({ key, count }) => (
                  <FilterChip key={key} active={filter === `o:${key}`} label={openingLabel(key)} count={count} onClick={() => chooseFilter(`o:${key}`)} />
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <HistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        total={played}
        onPick={(p) => {
          setHistoryOpen(false);
          load(p, "practice");
        }}
      />
    </div>
  );
};

const FilterChip: FC<{ active: boolean; label: string; count: number; onClick: () => void }> = ({ active, label, count, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
    )}
  >
    {label}
    <span className={cn("font-mono text-[11px] tabular", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
  </button>
);

const TrainerDone: FC<{ puzzle: TrainerPuzzle; outcome: Outcome; mode: Mode; onNext: () => void; onRetry: () => void }> = ({
  puzzle,
  outcome,
  mode,
  onNext,
  onRetry,
}) => {
  const title = outcome.ok ? "Resolvido!" : outcome.gaveUp ? "Solução vista" : "Resolvido com erro";
  const tone = outcome.ok ? "bg-success-soft" : "bg-danger-soft";
  const titleTone = outcome.ok ? "text-success" : "text-danger";
  const opening = puzzle.o >= 0 ? openingLabel(OPENING_KEYS[puzzle.o]) : null;
  return (
    <div className={cn("border-t px-4 pt-3 pb-safe", tone)} role="status" aria-live="polite">
      <div className="mx-auto flex w-full max-w-[30rem] flex-col gap-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className={cn("font-display text-lg font-bold", titleTone)}>
            {title}
            {mode === "rated" && outcome.delta !== null && (
              <span className="ml-2 font-mono text-base tabular">{outcome.delta >= 0 ? `+${outcome.delta}` : outcome.delta}</span>
            )}
          </p>
          <span className="text-xs text-muted-foreground">
            Puzzle <span className="font-mono">{puzzle.i}</span> · rating <span className="font-mono tabular">{puzzle.r}</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {themesOf(puzzle).map((t) => (
            <span key={t} className="rounded-full bg-background/70 px-2 py-0.5 text-xs font-medium">
              {themeLabel(t)}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {opening && <span className="text-muted-foreground">{opening}</span>}
          <a href={`https://lichess.org/training/${puzzle.i}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">
            Ver no Lichess <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          <a href={`https://lichess.org/${puzzle.g}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-4">
            Partida original <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="outline" className="h-12 rounded-xl bg-background font-semibold" onClick={onRetry}>
            <RotateCcw className="!h-4 !w-4" /> Refazer
          </Button>
          <Button className="h-12 rounded-xl text-base font-bold" onClick={onNext} autoFocus>
            Próximo puzzle
          </Button>
        </div>
      </div>
    </div>
  );
};

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<PuzzleStatus, string> = { ok: "Resolvido", erro: "Com erro", solucao: "Solução vista" };

const HistorySheet: FC<{ open: boolean; onOpenChange: (v: boolean) => void; total: number; onPick: (p: TrainerPuzzle) => void }> = ({
  open,
  onOpenChange,
  total,
  onPick,
}) => {
  const { loadPuzzlePage } = useProgress();
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState<{ page: number; total: number; entries: PuzzleLogEntry[] } | null>(null);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Null while the page being shown has not arrived yet, which renders "Carregando...".
  const entries = loaded && loaded.page === page && loaded.total === total ? loaded.entries : null;

  // Always reopen on the newest page.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPage(0);
  }

  useEffect(() => {
    if (!open) return;
    let alive = true;
    loadPuzzlePage(page, PAGE_SIZE).then((e) => alive && setLoaded({ page, total, entries: e }));
    return () => {
      alive = false;
    };
  }, [open, page, total, loadPuzzlePage]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-display">Histórico</SheetTitle>
          <SheetDescription>
            {total} {total === 1 ? "puzzle" : "puzzles"} no total. Toque para refazer (não muda o rating).
          </SheetDescription>
        </SheetHeader>
        <ul className="-mx-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-2">
          {total === 0 && <li className="px-2 text-sm text-muted-foreground">Nenhum puzzle ainda.</li>}
          {total > 0 && entries === null && <li className="px-2 text-sm text-muted-foreground">Carregando...</li>}
          {entries?.map((h, i) => {
            const p = puzzleById(h.i);
            if (!p) return null;
            const Icon = h.s === "ok" ? Check : h.s === "erro" ? X : Eye;
            return (
              <li key={`${h.i}-${h.t}-${i}`}>
                <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent">
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full",
                      h.s === "ok" ? "bg-success-soft text-success" : h.s === "erro" ? "bg-danger-soft text-danger" : "bg-secondary text-muted-foreground",
                    )}
                    aria-label={STATUS_LABEL[h.s]}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold">{themesOf(p).slice(0, 3).map(themeLabel).join(", ")}</span>
                    <span className="text-xs text-muted-foreground">
                      {STATUS_LABEL[h.s]} · puzzle <span className="font-mono tabular">{h.p}</span> ·{" "}
                      {new Date(h.t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className={cn("font-mono text-sm font-bold tabular", h.d >= 0 ? "text-success" : "text-danger")}>{h.d >= 0 ? `+${h.d}` : h.d}</span>
                    <span className="font-mono text-[11px] tabular text-muted-foreground">{h.r}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {pages > 1 && (
          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button variant="outline" size="sm" className="rounded-lg" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="!h-4 !w-4" /> Mais novos
            </Button>
            <span className="text-xs text-muted-foreground">
              Página <span className="font-mono tabular">{page + 1}</span> de <span className="font-mono tabular">{pages}</span>
            </span>
            <Button variant="outline" size="sm" className="rounded-lg" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              Mais antigos <ChevronRight className="!h-4 !w-4" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
