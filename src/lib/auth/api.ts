/**
 * Talks to the API in server/. Same origin as the page, so the session cookie
 * rides along on its own and there is nothing to store in the browser.
 *
 * The database behind the API is the only place progress lives, so a server
 * that cannot be reached is `ApiOffline`, and the app shows the offline screen.
 */
export interface Account {
  id: string;
  email: string;
  /** Opens /admin, where the accounts are managed. The first account is it. */
  isAdmin: boolean;
}

/** The API cannot be reached right now. */
export class ApiOffline extends Error {
  constructor() {
    super("Sem conexão com o servidor. Tente de novo.");
    this.name = "ApiOffline";
  }
}

/** The error codes the API answers with, in Portuguese. */
const MESSAGES: Record<string, string> = {
  invalid_credentials: "E-mail ou senha não conferem.",
  invalid_email: "Esse e-mail não parece válido.",
  weak_password: "A senha precisa de pelo menos 8 caracteres.",
  email_taken: "Já existe uma conta com esse e-mail.",
  signup_closed: "As inscrições estão fechadas.",
  too_many_attempts: "Tentativas demais. Espere alguns minutos.",
  invalid_token: "Este link não vale mais. Peça outro.",
  forbidden: "Esta parte é só para quem administra.",
  cannot_remove_self: "Você não pode tirar a si mesmo da administração.",
  not_found: "Essa conta não existe mais.",
  reset_unavailable: "Este site não está configurado para enviar e-mail.",
  server_error: "O servidor não respondeu direito. Tente de novo.",
  unauthorized: "A sessão expirou. Entre de novo.",
  backup_version: "Este arquivo é de uma versão que o app não conhece.",
  backup_corrupt: "O progresso dentro do arquivo está corrompido.",
  not_a_backup: "Esse arquivo não é um backup do Lance a Lance.",
  backup_too_big: "Esse arquivo é grande demais para ser um backup.",
};

export class ApiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(MESSAGES[code] ?? "Não deu certo. Tente de novo.");
    this.name = "ApiError";
    this.code = code;
  }
}

/**
 * One request to the API. A 401 comes back as its body for the calls that ask
 * who is signed in (`allowUnauthorized`); anywhere else it is an error.
 */
export async function call<T>(path: string, init?: RequestInit & { allowUnauthorized?: boolean }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiOffline();
  }
  // A proxy in front of a server that is down answers with an error page, not JSON.
  if (!response.headers.get("content-type")?.includes("application/json")) throw new ApiOffline();
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (response.ok) return body as T;
  if (response.status === 401 && init?.allowUnauthorized) return body as T;
  throw new ApiError(body?.error ?? "server_error");
}

export async function fetchAccount(): Promise<Account | null> {
  const body = await call<{ user: Account | null }>("/auth/me", { allowUnauthorized: true });
  return body?.user ?? null;
}

export interface AuthConfig {
  signupOpen: boolean;
  /** False when the server has no SMTP, so there is no way to send a link. */
  resetOpen: boolean;
  /** False when the server has no GOOGLE_CLIENT_ID, so there is nowhere to go. */
  googleOpen: boolean;
}

export const CLOSED_CONFIG: AuthConfig = { signupOpen: false, resetOpen: false, googleOpen: false };

export async function fetchConfig(): Promise<AuthConfig> {
  const body = await call<{ signupEnabled: boolean; resetEnabled: boolean; googleEnabled: boolean }>("/auth/config");
  return {
    signupOpen: Boolean(body?.signupEnabled),
    resetOpen: Boolean(body?.resetEnabled),
    googleOpen: Boolean(body?.googleEnabled),
  };
}

/** Where the button goes. A redirect, not a fetch: the flow leaves the app. */
export const GOOGLE_SIGN_IN = "/api/auth/google";

/** What the server can send back on `/?erro=...` when the flow does not end well. */
const GOOGLE_ERRORS: Record<string, string> = {
  google_unavailable: "Entrar com o Google não está disponível aqui.",
  google_state: "A entrada pelo Google demorou demais. Tente de novo.",
  google_failed: "Não deu para entrar com o Google. Tente de novo.",
  email_unverified: "O Google não confirmou esse e-mail, então ele não serve para entrar aqui.",
  signup_closed: "As inscrições estão fechadas.",
};

export const messageForError = (code: string): string => GOOGLE_ERRORS[code] ?? "Não deu certo. Tente de novo.";

/** Always resolves, whether or not the address has an account. */
export async function requestPasswordReset(email: string): Promise<void> {
  await call<{ ok: boolean }>("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await call<{ ok: boolean }>("/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
}

export async function login(email: string, password: string): Promise<Account> {
  const body = await call<{ user: Account | null }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!body?.user) throw new ApiError("invalid_credentials");
  return body.user;
}

export async function signup(email: string, password: string): Promise<Account> {
  const body = await call<{ user: Account | null }>("/auth/signup", { method: "POST", body: JSON.stringify({ email, password }) });
  if (!body?.user) throw new ApiError("server_error");
  return body.user;
}

export async function logout(): Promise<void> {
  await call<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

/* ---------- the admin page ---------- */

export interface ManagedUser {
  id: string;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
  xp: number;
  lessons: number;
  lastSeen: string | null;
}

export async function fetchUsers(): Promise<ManagedUser[]> {
  const body = await call<{ users: ManagedUser[] }>("/admin/users");
  return body?.users ?? [];
}

export async function addUser(email: string): Promise<void> {
  await call<{ user: Account }>("/admin/users", { method: "POST", body: JSON.stringify({ email }) });
}

export async function removeUser(id: string): Promise<void> {
  await call<{ ok: boolean }>(`/admin/users/${id}`, { method: "DELETE" });
}

export async function setUserAdmin(id: string, isAdmin: boolean): Promise<void> {
  await call<{ user: Account }>(`/admin/users/${id}/admin`, { method: "POST", body: JSON.stringify({ isAdmin }) });
}
