import { useMemo, useState, type FC } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryList } from "@/components/common/HistoryList";
import { GameHeader, GameRow } from "@/components/game/parts";
import { useProgress } from "@/lib/progress/useProgress";
import type { Game, GameKind, Page } from "@/lib/progress/types";
import { goBack, navigate, paths, routeState } from "@/lib/router";

const TABS: { kind: GameKind; label: string; empty: string }[] = [
  { kind: "rated", label: "Partidas", empty: "Nenhuma partida ainda." },
  { kind: "assisted", label: "Assistidas", empty: "Nenhuma partida assistida ainda." },
  { kind: "study", label: "Estudos", empty: "Nenhum estudo ainda. Na revisão de uma partida, escolha um lance e jogue a partir dele." },
];

const kindOf = (tab: unknown): GameKind => TABS.find((t) => t.kind === tab)?.kind ?? "rated";

/**
 * The finished games at `/partidas`: rated, assisted and study games apart.
 * The tab is kept with the page's history entry, so coming back from a
 * review, or a reload, lands on the same one.
 */
export const GameHistory: FC = () => {
  const { games } = useProgress();
  const [kind, setKind] = useState<GameKind>(() => kindOf(routeState().tab));
  const choose = (next: string) => {
    const tab = kindOf(next);
    setKind(tab);
    window.history.replaceState({ ...routeState(), tab }, "");
  };

  // One loader per tab, kept across renders: the list reloads when its loader changes.
  const loaders = useMemo(
    () => Object.fromEntries(TABS.map((t) => [t.kind, (page: number, size: number) => games.page(page, size, t.kind)])) as Record<GameKind, (page: number, size: number) => Promise<Page<Game>>>,
    [games],
  );
  const row = (g: Game) => <GameRow game={g} onPick={() => navigate(paths.gameReview(g.id))} />;

  return (
    <div className="flex h-full flex-col bg-background">
      <GameHeader onBack={() => goBack(paths.game)} backLabel="Voltar para a partida" subtitle="Partidas anteriores" />
      <main className="mx-auto flex min-h-0 w-full max-w-[30rem] flex-1 flex-col px-4 pb-4 pt-3">
        <Tabs value={kind} onValueChange={choose} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-3">
            {TABS.map((t) => (
              <TabsTrigger key={t.kind} value={t.kind}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {/* An inactive tab stays in the page, empty and `hidden`, which `flex` would override: it would take its share of the height. */}
          {TABS.map((t) => (
            <TabsContent key={t.kind} value={t.kind} className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
              <HistoryList empty={t.empty} load={loaders[t.kind]} keyOf={(g) => g.id} render={row} />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
};
