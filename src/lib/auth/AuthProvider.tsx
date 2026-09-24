import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import { ApiUnavailable, fetchAccount, fetchConfig, login, logout, signup } from "@/lib/auth/api";
import { AuthContext, type AuthState } from "@/lib/auth/context";
import { clearLocal } from "@/lib/progress/storage";

/**
 * True when there cannot be an API to ask: a page opened from the file system,
 * where fetch has nowhere to go.
 */
const noApiPossible = () => typeof window === "undefined" || !/^https?:$/.test(window.location.protocol);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(() => (noApiPossible() ? { kind: "unavailable" } : { kind: "loading" }));

  useEffect(() => {
    if (state.kind !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const account = await fetchAccount();
        if (cancelled) return;
        if (account) {
          setState({ kind: "signed-in", account });
          return;
        }
        const config = await fetchConfig().catch(() => ({ signupOpen: false, resetOpen: false }));
        if (!cancelled) setState({ kind: "anonymous", ...config });
      } catch (error) {
        if (cancelled) return;
        // Nothing listening on /api, so there are no accounts to offer and the
        // app runs on this browser's copy. Any other failure means the server
        // is there but unhappy, so still offer to sign in.
        setState(
          error instanceof ApiUnavailable ? { kind: "unavailable" } : { kind: "anonymous", signupOpen: false, resetOpen: false },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.kind]);

  const signIn = useCallback(async (email: string, password: string) => {
    setState({ kind: "signed-in", account: await login(email, password) });
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setState({ kind: "signed-in", account: await signup(email, password) });
  }, []);

  const signOut = useCallback(async () => {
    await logout().catch(() => undefined);
    // The account keeps the progress; this browser does not. Otherwise the next
    // person to use it would find somebody else's XP waiting, and could carry
    // it into their own account.
    clearLocal();
    const config = await fetchConfig().catch(() => ({ signupOpen: false, resetOpen: false }));
    setState({ kind: "anonymous", ...config });
  }, []);

  const value = useMemo(() => ({ state, signIn, signUp, signOut }), [state, signIn, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
