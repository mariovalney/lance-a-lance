import { useState, type FC, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/auth/api";

/**
 * Where the link in the reset email lands (`/redefinir?token=...`).
 *
 * Spending the token signs every device out, this one included, so after it
 * works the only thing left to do is sign in again with the new password.
 */
export const ResetScreen: FC<{ token: string; onDone: () => void }> = ({ token, onDone }) => {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== again) {
      setError("As duas senhas não são iguais.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não deu certo. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[26rem] flex-col justify-center gap-5 px-4 py-10">
      <h1 className="font-display text-2xl font-extrabold tracking-tight">Nova senha</h1>

      {done ? (
        <>
          <p className="flex items-start gap-2 text-[15px] leading-snug">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            Senha trocada. Por segurança, todos os aparelhos foram desconectados. Entre de novo nos Ajustes.
          </p>
          <Button onClick={onDone}>Ir para o início</Button>
        </>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <p className="text-[15px] leading-snug text-muted-foreground">Escolha uma senha de pelo menos 8 caracteres.</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-password">Senha nova</Label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reset-again">Repita a senha</Label>
            <Input
              id="reset-again"
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="mt-1 gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Trocar a senha
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-8 self-center text-xs" onClick={onDone}>
            Voltar para o início
          </Button>
        </form>
      )}
    </div>
  );
};
