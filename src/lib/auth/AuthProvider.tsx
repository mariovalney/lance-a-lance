import { useCallback, useEffect, useMemo, useState, type FC, type ReactNode } from "react";
import { ApiUnavailable, fetchAccount, fetchSignupOpen, login, logout, signup } from "@/lib/auth/api";
import { AuthContext, type AuthState } from "@/lib/auth/context";

/** Inside the artifact the runtime provides its own database and viewer id. */
const insideArtifact = () => typeof window !== "undefined" && Boolean(window.claude?.use);

export const AuthProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>(() => (insideArtifact() ? { kind: "unavailable" } : { kind: "loading" }));

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
        const signupOpen = await fetchSignupOpen().catch(() => false);
        if (!cancelled) setState({ kind: "anonymous", signupOpen });
      } catch (error) {
        if (cancelled) return;
        // Nothing listening on /api, so there are no accounts to offer and the
        // app runs on this browser's copy. Any other failure means the server
        // is there but unhappy, so still offer to sign in.
        setState(error instanceof ApiUnavailable ? { kind: "unavailable" } : { kind: "anonymous", signupOpen: false });
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
    const signupOpen = await fetchSignupOpen().catch(() => false);
    setState({ kind: "anonymous", signupOpen });
  }, []);

  const value = useMemo(() => ({ state, signIn, signUp, signOut }), [state, signIn, signUp, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
