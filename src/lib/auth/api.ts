/**
 * Talks to the API in server/. Same origin as the page, so the session cookie
 * rides along on its own and there is nothing to store in the browser.
 *
 * Every call has to survive there being no API at all: inside the claude.ai
 * artifact, and on any plain static host, `/api/...` answers with the app's own
 * HTML or a 404. `ApiUnavailable` is how that case is told apart from a real
 * failure, so the interface can hide the account section instead of showing an
 * error the reader cannot act on.
 */
export interface Account {
  id: string;
  email: string;
}

export class ApiUnavailable extends Error {
  constructor() {
    super("no API behind this page");
    this.name = "ApiUnavailable";
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
  server_error: "O servidor não respondeu direito. Tente de novo.",
};

export class ApiError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(MESSAGES[code] ?? "Não deu certo. Tente de novo.");
    this.name = "ApiError";
    this.code = code;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
      credentials: "same-origin",
    });
  } catch {
    // Offline, or nothing listening.
    throw new ApiUnavailable();
  }

  // A static host answers a missing route with the app shell, not with JSON.
  if (!response.headers.get("content-type")?.includes("application/json")) throw new ApiUnavailable();

  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (response.ok) return body as T;
  if (response.status === 401) return body as T;
  throw new ApiError(body?.error ?? "server_error");
}

export async function fetchAccount(): Promise<Account | null> {
  const body = await call<{ user: Account | null }>("/auth/me");
  return body?.user ?? null;
}

export async function fetchSignupOpen(): Promise<boolean> {
  const body = await call<{ signupEnabled: boolean }>("/auth/config");
  return Boolean(body?.signupEnabled);
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
