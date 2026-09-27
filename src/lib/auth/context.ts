import { createContext } from "react";
import type { Account } from "@/lib/auth/api";

/**
 * - `loading`: still asking the server who is signed in.
 * - `offline`: the server cannot be reached. Nothing to show, since progress
 *   lives in the account.
 * - `anonymous`: there is an API and nobody is signed in.
 * - `signed-in`: progress is the account's.
 */
export type AuthState =
  | { kind: "loading" }
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
