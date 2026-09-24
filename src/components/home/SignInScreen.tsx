import { useState, type FC, type FormEvent } from "react";
import { ChessKnight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/useAuth";

/**
 * The whole app behind one account. Progress lives in the account, so there is
 * no signed out mode to fall back to: this is what a visitor sees until they
 * are in.
 */
export const SignInScreen: FC<{ signupOpen: boolean; resetOpen: boolean }> = ({ signupOpen, resetOpen }) => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const creating = mode === "signup" && signupOpen;

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

  const forgot = async () => {
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Escreva seu e-mail acima primeiro.");
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email);
      // Deliberately the same message either way: the server does not say
      // whether the address has an account, and neither does this.
      setSent(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não deu certo. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[24rem] flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-foreground text-background" aria-hidden>
          <ChessKnight className="h-8 w-8" strokeWidth={2.25} />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[1.75rem] font-extrabold leading-none tracking-tight">Lance a Lance</h1>
          <p className="text-sm text-muted-foreground">Entre para o seu progresso acompanhar você em qualquer aparelho.</p>
        </div>
      </div>

      <form className="flex flex-col gap-2" onSubmit={submit}>
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
        {sent && (
          <p role="status" className="text-xs text-muted-foreground">
            Se existir uma conta com esse e-mail, o link para escolher uma senha nova já está a caminho. Ele vale por 30 minutos.
          </p>
        )}
        <Button type="submit" disabled={busy} className="mt-1 h-11 gap-2 rounded-xl font-bold">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {creating ? "Criar conta" : "Entrar"}
        </Button>
        <div className="flex flex-wrap items-center justify-center gap-x-1">
          {signupOpen && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setSent(false);
              }}
            >
              {mode === "signin" ? "Ainda não tenho conta" : "Já tenho conta"}
            </Button>
          )}
          {!creating && resetOpen && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled={busy} onClick={forgot}>
              Esqueci a senha
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};
