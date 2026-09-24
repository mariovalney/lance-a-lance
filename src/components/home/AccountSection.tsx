import { useState, type FC } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth/useAuth";

/**
 * The way out, last in the settings dialog. Signing out takes the app back to
 * the sign in screen, since there is no signed out mode.
 *
 * Renders nothing when the page has no API behind it, which is a plain static
 * host with no accounts to offer.
 */
export const AccountSection: FC = () => {
  const { state, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  if (state.kind !== "signed-in") return null;

  return (
    <>
      <Separator />
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">{state.account.email}</span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1.5 text-danger hover:bg-danger/10 hover:text-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOut();
            setBusy(false);
          }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Sair
        </Button>
      </div>
    </>
  );
};
