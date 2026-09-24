import { useState, type FC, type FormEvent } from "react";
import { ChessKnight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { GOOGLE_SIGN_IN, messageForError, requestPasswordReset } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/useAuth";

/**
 * Google hands the browser back to `/?erro=<code>` when the flow does not end
 * in a session. Read once, so that a reload does not bring the message back.
 */
function errorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("erro");
  if (!code) return null;
  window.history.replaceState(null, "", window.location.pathname);
  return messageForError(code);
}

/** Google's G, in its four colours, as their guidelines ask for it. */
const GoogleMark: FC = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
    <path
      fill="#4285F4"
      d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.5 6.6-16.3z"
    />
    <path
      fill="#34A853"
      d="M24 46c5.9 0 10.9-2 14.5-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.3 15.5 46 24 46z"
    />
    <path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3.1.7-4.4v-5.7H4.5C2.9 17 2 20.4 2 24s.9 7 2.5 10.1l7.3-5.7z" />
    <path
      fill="#EA4335"
      d="M24 10.4c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.5 2 8.1 6.7 4.5 13.9l7.3 5.7c1.7-5.2 6.5-9.2 12.2-9.2z"
    />
  </svg>
);

/**
 * The whole app behind one account. Progress lives in the account, so there is
 * no signed out mode to fall back to: this is what a visitor sees until they
 * are in.
 */
export const SignInScreen: FC<{ signupOpen: boolean; resetOpen: boolean; googleOpen: boolean }> = ({ signupOpen, resetOpen, googleOpen }) => {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(errorFromUrl);
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

      {googleOpen && (
        <div className="flex flex-col gap-4">
          <Button asChild variant="outline" className="h-11 gap-2 rounded-xl font-bold">
            <a href={GOOGLE_SIGN_IN}>
              <GoogleMark />
              Entrar com Google
            </a>
          </Button>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">ou</span>
            <Separator className="flex-1" />
          </div>
        </div>
      )}

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
