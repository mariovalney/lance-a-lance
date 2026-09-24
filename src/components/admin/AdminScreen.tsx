import { useCallback, useEffect, useState, type FC, type FormEvent } from "react";
import { ArrowLeft, Loader2, Shield, ShieldOff, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addUser, fetchUsers, removeUser, setUserAdmin, type ManagedUser } from "@/lib/auth/api";
import { useAuth } from "@/lib/auth/useAuth";

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString("pt-BR") : "nunca");

/** How this person can get in, which is what says whether they ever will. */
function waysIn(user: ManagedUser): string {
  const ways = [user.hasPassword ? "senha" : null, ...user.providers.map((p) => (p === "google" ? "Google" : p))].filter(Boolean);
  return ways.length ? ways.join(" e ") : "ainda não entrou";
}

/**
 * The people who can use the app. Reachable at /admin, and only by the admin:
 * the server refuses the calls to anyone else, and this screen is not offered.
 *
 * An account starts here with an address and nothing else. Its owner gets in
 * with Google, if the address matches, or by asking for a password on the sign
 * in screen. There is no invitation to accept and no temporary password.
 */
export const AdminScreen: FC<{ onHome: () => void }> = ({ onHome }) => {
  const { state } = useAuth();
  const me = state.kind === "signed-in" ? state.account : null;
  const [users, setUsers] = useState<ManagedUser[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<ManagedUser | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await fetchUsers());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não deu para carregar as contas.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchUsers();
        if (!cancelled) setUsers(rows);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Não deu para carregar as contas.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = async (action: () => Promise<void>, done: string) => {
    setError(null);
    setNote(null);
    setBusy(true);
    try {
      await action();
      await load();
      setNote(done);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Não deu certo. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    await run(() => addUser(address), `Conta criada para ${address}. Ela entra com o Google ou pedindo uma senha.`);
    setEmail("");
  };

  return (
    <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-5 px-4 pb-10">
      <header className="flex items-center gap-2 pt-5">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label="Voltar" onClick={onHome}>
          <ArrowLeft className="!h-5 !w-5" />
        </Button>
        <h1 className="font-display text-[1.5rem] font-extrabold leading-none tracking-tight">Contas</h1>
      </header>

      <form className="flex flex-col gap-2 rounded-2xl border bg-card p-3" onSubmit={submit}>
        <label htmlFor="admin-email" className="text-[15px] font-medium">
          Liberar uma pessoa
        </label>
        <p className="text-xs text-muted-foreground">
          Só o endereço. Ela entra com o Google, se for a conta dela, ou pedindo uma senha em "Esqueci a senha".
        </p>
        <div className="flex gap-2">
          <Input
            id="admin-email"
            type="email"
            inputMode="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy} className="shrink-0 gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
            Liberar
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
        {note && (
          <p role="status" className="text-xs text-muted-foreground">
            {note}
          </p>
        )}
      </form>

      <section className="flex flex-col">
        <div className="flex items-baseline justify-between pb-1">
          <h2 className="font-display text-lg font-bold">Quem tem acesso</h2>
          {users && <span className="text-xs text-muted-foreground">{users.length}</span>}
        </div>

        {!users ? (
          <div className="grid place-items-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando" />
          </div>
        ) : (
          <ul className="flex flex-col rounded-2xl border bg-card">
            {users.map((user) => (
              <li key={user.id} className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0" data-user={user.email}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {user.email}
                    {user.isAdmin && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        admin
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {waysIn(user)} · <span className="font-mono tabular">{user.xp}</span> XP ·{" "}
                    <span className="font-mono tabular">{user.lessons}</span> {user.lessons === 1 ? "lição" : "lições"} · visto em{" "}
                    {day(user.lastSeen)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full"
                  disabled={busy || user.id === me?.id}
                  aria-label={user.isAdmin ? `Tirar ${user.email} da administração` : `Tornar ${user.email} administrador`}
                  onClick={() =>
                    void run(
                      () => setUserAdmin(user.id, !user.isAdmin),
                      user.isAdmin ? `${user.email} não administra mais.` : `${user.email} agora administra.`,
                    )
                  }
                >
                  {user.isAdmin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full text-danger hover:bg-danger/10 hover:text-danger"
                  disabled={busy || user.id === me?.id}
                  aria-label={`Apagar a conta de ${user.email}`}
                  onClick={() => setConfirmRemove(user)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={confirmRemove !== null} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <DialogContent className="max-w-[22rem] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Apagar esta conta?</DialogTitle>
            <DialogDescription>
              {confirmRemove?.email} perde o acesso, e o progresso, as estrelas e o histórico de puzzles vão junto. Não dá para
              desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button variant="ghost" className="h-11 w-full rounded-xl" onClick={() => setConfirmRemove(null)}>
              Cancelar
            </Button>
            <Button
              className="h-11 w-full rounded-xl bg-danger font-bold text-destructive-foreground hover:bg-danger/90"
              onClick={() => {
                const doomed = confirmRemove;
                setConfirmRemove(null);
                if (doomed) void run(() => removeUser(doomed.id), `A conta de ${doomed.email} foi apagada.`);
              }}
            >
              Apagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
