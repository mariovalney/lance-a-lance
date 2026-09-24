import { useState, type FC, type FormEvent } from "react";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth/useAuth";

/**
 * Sign in and sign out, inside the settings dialog. Renders nothing at all when
 * the page has no API behind it, which is the case inside the claude.ai
 * artifact and on a plain static host.
 *
 * Signing in on a device that already has progress pushes that progress to the
 * account when it is the newer of the two, which is how progress kept in a
 * browser gets adopted by an account.
 */
export const AccountSection: FC = () => {
  const { state, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.kind === "unavailable") return null;

  if (state.kind === "loading") {
    return (
      <>
        <Separator />
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Vendo se você já entrou
        </p>
      </>
    );
  }

  if (state.kind === "signed-in") {
    return (
      <>
        <Separator />
        <div className="flex flex-col gap-2">
          <Label className="text-[15px]">Conta</Label>
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-3 py-2">
            <span className="min-w-0 truncate text-sm">{state.account.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5"
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
          <p className="text-xs text-muted-foreground">Seu progresso sincroniza entre os aparelhos em que você entrar.</p>
        </div>
      </>
    );
  }

  const creating = mode === "signup" && state.signupOpen;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await (creating ? signUp(email, password) : signIn(email, password));
      setPassword("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não deu certo. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Separator />
      <form className="flex flex-col gap-2" onSubmit={submit}>
        <Label className="text-[15px]">{creating ? "Criar conta" : "Entrar"}</Label>
        <p className="text-xs text-muted-foreground">
          Sem entrar, o progresso fica só neste navegador. Entrando, ele sincroniza entre os seus aparelhos.
        </p>
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          autoComplete={creating ? "new-password" : "current-password"}
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="mt-1 gap-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {creating ? "Criar conta" : "Entrar"}
        </Button>
        {state.signupOpen && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 self-center text-xs"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
          >
            {mode === "signin" ? "Ainda não tenho conta" : "Já tenho conta"}
          </Button>
        )}
      </form>
    </>
  );
};
