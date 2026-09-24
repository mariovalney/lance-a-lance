import type { FC } from "react";
import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/useAuth";

/**
 * The server answered from this browser before and does not answer now.
 * Progress lives in the account, so there is nothing to show until it does.
 */
export const OfflineScreen: FC = () => {
  const { retry } = useAuth();
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[24rem] flex-col justify-center gap-6 px-4 py-10 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-muted-foreground" aria-hidden>
          <CloudOff className="h-8 w-8" />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[1.5rem] font-extrabold leading-none tracking-tight">Sem conexão</h1>
          <p className="text-sm text-muted-foreground">
            Seu progresso está guardado na sua conta. Assim que a internet voltar, é só continuar.
          </p>
        </div>
      </div>
      <Button className="h-11 rounded-xl font-bold" onClick={retry}>
        Tentar de novo
      </Button>
    </div>
  );
};
