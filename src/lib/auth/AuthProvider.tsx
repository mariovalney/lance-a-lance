import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import { ApiOffline, CLOSED_CONFIG, fetchAccount, fetchConfig, login, logout, signup } from "@/lib/auth/api";
import { AuthContext, type AuthState } from "@/lib/auth/context";

/**
 * Keys older versions of the app kept in the browser: the progress copy, the
 * puzzle history chunks, and the flag that told a static host from an offline
 * phone. Progress lives only in the account now, so they go on the first visit.
 */
function forgetOldBrowserCopies(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key === "lance-a-lance:progress:v1" || key === "lance-a-lance:api:v1" || key.startsWith("lance-a-lance:puzzlelog:")) localStorage.removeItem(key);
    }
  } catch {
    /* nothing to clear */
  }
}

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({ kind: "loading" });

  useEffect(() => forgetOldBrowserCopies(), []);

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
        const config = await fetchConfig().catch(() => CLOSED_CONFIG);
        if (!cancelled) setState({ kind: "anonymous", ...config });
      } catch (error) {
        if (cancelled) return;
        // The server cannot be reached: there is nothing to show without it.
        // Anything else means it is there but unhappy, so still offer to sign in.
        if (error instanceof ApiOffline) setState({ kind: "offline" });
        else setState({ kind: "anonymous", ...CLOSED_CONFIG });
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
    const config = await fetchConfig().catch(() => CLOSED_CONFIG);
    setState({ kind: "anonymous", ...config });
  }, []);

  const retry = useCallback(() => setState({ kind: "loading" }), []);

  const value = useMemo(() => ({ state, signIn, signUp, signOut, retry }), [state, signIn, signUp, signOut, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
