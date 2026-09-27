import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Page } from "@/lib/progress/types";

const PAGE_SIZE = 20;

interface HistoryListProps<T> {
  empty: string;
  /** Changes whenever a new entry lands, so the list reloads. */
  version?: number;
  load: (page: number, size: number) => Promise<Page<T>>;
  keyOf: (item: T) => string | number;
  render: (item: T) => ReactNode;
}

/**
 * A history the server keeps, newest first, a page at a time. It starts on the
 * newest page every time it mounts.
 */
export function HistoryList<T>({ empty, version = 0, load, keyOf, render }: HistoryListProps<T>) {
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState<{ page: number; version: number; data: Page<T> } | null>(null);
  const [failed, setFailed] = useState(false);
  // Null while the page being shown has not arrived yet, which renders "Carregando...".
  const data = loaded && loaded.page === page && loaded.version === version ? loaded.data : null;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  useEffect(() => {
    let alive = true;
    load(page, PAGE_SIZE)
      .then((d) => {
        if (!alive) return;
        setFailed(false);
        setLoaded({ page, version, data: d });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [page, version, load]);

  return (
    <>
      <ul className="-mx-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto py-2">
        {failed && <li className="px-2 text-sm text-muted-foreground">Sem conexão com o servidor.</li>}
        {!failed && data === null && <li className="px-2 text-sm text-muted-foreground">Carregando...</li>}
        {data?.total === 0 && <li className="px-2 text-sm text-muted-foreground">{empty}</li>}
        {data?.items.map((item) => <li key={keyOf(item)}>{render(item)}</li>)}
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
    </>
  );
}
