import { createContext } from "react";
import type { Account } from "@/lib/auth/api";

/**
 * - `loading`: still asking the server who is signed in.
 * - `unavailable`: there is no API behind this page, so there are no accounts.
 *   That is any plain static host, which is how the browser checks serve the
 *   build. The interface hides everything about accounts and progress stays in
 *   this browser.
 * - `offline`: there is an API and it cannot be reached. Nothing to show, since
 *   progress lives in the account.
 * - `anonymous`: there is an API and nobody is signed in.
 * - `signed-in`: progress is the account's.
 */
export type AuthState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "offline" }
  | { kind: "anonymous"; signupOpen: boolean; resetOpen: boolean; googleOpen: boolean }
  | { kind: "signed-in"; account: Account };

export interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Asks the server again, for the offline screen. */
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * What the progress store keys off: a new value means reconnect. `no-api` is
 * the only identity that keeps progress in this browser; an account keeps it
 * in the account alone.
 */
export function storageIdentity(state: AuthState): string | null {
  if (state.kind === "signed-in") return `account:${state.account.id}`;
  if (state.kind === "unavailable") return "no-api";
  return null;
}
