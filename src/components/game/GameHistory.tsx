import { useCallback, useState, type FC } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoryList } from "@/components/common/HistoryList";
import { GameHeader, GameRow } from "@/components/game/parts";
import { useProgress } from "@/lib/progress/useProgress";
import { goBack, navigate, paths, routeState } from "@/lib/router";

type Kind = "rated" | "assisted";

/**
 * The finished games at `/partidas`, rated and assisted apart. The tab is kept
 * with the page's history entry, so coming back from a review, or a reload,
 * lands on the same one.
 */
export const GameHistory: FC = () => {
  const { games } = useProgress();
  const [kind, setKind] = useState<Kind>(() => (routeState().tab === "assisted" ? "assisted" : "rated"));
  const choose = (next: string) => {
    const tab = next === "assisted" ? "assisted" : "rated";
    setKind(tab);
    window.history.replaceState({ ...routeState(), tab }, "");
  };

  const loadRated = useCallback((page: number, size: number) => games.page(page, size, false), [games]);
  const loadAssisted = useCallback((page: number, size: number) => games.page(page, size, true), [games]);
  const row = (g: Parameters<typeof GameRow>[0]["game"]) => <GameRow game={g} onPick={() => navigate(paths.gameReview(g.id))} />;

  return (
    <div className="flex h-full flex-col bg-background">
      <GameHeader onBack={() => goBack(paths.game)} backLabel="Voltar para a partida" subtitle="Partidas anteriores" />
      <main className="mx-auto flex min-h-0 w-full max-w-[30rem] flex-1 flex-col px-4 pb-4 pt-3">
        <Tabs value={kind} onValueChange={choose} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="rated">Partidas</TabsTrigger>
            <TabsTrigger value="assisted">Assistidas</TabsTrigger>
          </TabsList>
          <TabsContent value="rated" className="flex min-h-0 flex-1 flex-col">
            <HistoryList empty="Nenhuma partida ainda." load={loadRated} keyOf={(g) => g.id} render={row} />
          </TabsContent>
          <TabsContent value="assisted" className="flex min-h-0 flex-1 flex-col">
            <HistoryList empty="Nenhuma partida assistida ainda." load={loadAssisted} keyOf={(g) => g.id} render={row} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};
