import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { HistoryList } from "@/components/common/HistoryList";
import type { Page } from "@/lib/progress/types";

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

/**
 * A bottom sheet paging through a history the server keeps, newest first. Its
 * content mounts on every opening, so it always opens on the newest page.
 */
export function HistorySheet<T>({ open, onOpenChange, description, ...list }: HistorySheetProps<T>) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-display">Histórico</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <HistoryList {...list} />
      </SheetContent>
    </Sheet>
  );
}
