import { createContext } from "react";
import type { Account } from "@/lib/auth/api";

/**
 * - `loading`: still asking the server who is signed in.
 * - `unavailable`: there is no API behind this page, so there are no accounts.
 *   That is the claude.ai artifact (which has its own database) and any plain
 *   static host. The interface hides everything about accounts.
 * - `anonymous`: there is an API and nobody is signed in. Progress stays in
 *   this browser until he signs in.
 * - `signed-in`: progress syncs to the account.
 */
export type AuthState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "anonymous"; signupOpen: boolean }
  | { kind: "signed-in"; account: Account };

export interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** What the progress store keys off: a new value means reconnect. */
export function storageIdentity(state: AuthState): string | null {
  if (state.kind === "loading") return null;
  if (state.kind === "signed-in") return `account:${state.account.id}`;
  if (state.kind === "unavailable") return "artifact";
  return "anonymous";
}
