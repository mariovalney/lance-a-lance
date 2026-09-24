import type { FC } from "react";
import { Cloud, CloudOff, Loader2, Smartphone } from "lucide-react";
import type { SyncStatus } from "@/lib/progress/types";
import { cn } from "@/lib/utils";

const LABEL: Record<SyncStatus, string> = {
  loading: "Conectando",
  syncing: "Salvando",
  cloud: "Na nuvem",
  local: "Neste aparelho",
  error: "Neste aparelho",
};

const TITLE: Record<SyncStatus, string> = {
  loading: "Conectando ao armazenamento na nuvem",
  syncing: "Salvando seu progresso",
  cloud: "Progresso salvo na nuvem: aparece em qualquer aparelho",
  local: "Progresso salvo só neste navegador",
  error: "Não foi possível falar com a nuvem agora. Seu progresso está guardado neste aparelho.",
};

export const SyncBadge: FC<{ status: SyncStatus; className?: string }> = ({ status, className }) => {
  const Icon = status === "loading" || status === "syncing" ? Loader2 : status === "cloud" ? Cloud : status === "error" ? CloudOff : Smartphone;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-muted-foreground", className)}
      title={TITLE[status]}
    >
      <Icon className={cn("h-3.5 w-3.5", (status === "loading" || status === "syncing") && "animate-spin")} aria-hidden />
      <span className="hidden min-[420px]:inline">{LABEL[status]}</span>
      <span className="sr-only min-[420px]:hidden">{LABEL[status]}</span>
    </span>
  );
};
