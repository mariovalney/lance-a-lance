import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Page } from "@/lib/progress/types";

export const HISTORY_PAGE_SIZE = 20;

interface HistorySheetProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: ReactNode;
  empty: string;
  /** Changes whenever a new entry lands, so an open sheet reloads. */
  version: number;
  load: (page: number, size: number) => Promise<Page<T>>;
  keyOf: (item: T) => string | number;
  render: (item: T) => ReactNode;
}

/** A bottom sheet paging through a history the server keeps, newest first. */
export function HistorySheet<T>({ open, onOpenChange, description, empty, version, load, keyOf, render }: HistorySheetProps<T>) {
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState<{ page: number; version: number; data: Page<T> } | null>(null);
  const [failed, setFailed] = useState(false);
  // Null while the page being shown has not arrived yet, which renders "Carregando...".
  const data = loaded && loaded.page === page && loaded.version === version ? loaded.data : null;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / HISTORY_PAGE_SIZE));

  // Always reopen on the newest page.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setPage(0);
  }

  useEffect(() => {
    if (!open) return;
    let alive = true;
    load(page, HISTORY_PAGE_SIZE)
      .then((d) => {
        if (!alive) return;
        setFailed(false);
        setLoaded({ page, version, data: d });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, page, version, load]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-display">Histórico</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
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
      </SheetContent>
    </Sheet>
  );
}
