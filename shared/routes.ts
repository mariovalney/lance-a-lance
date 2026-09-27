/**
 * The addresses the app answers, in one list for the three places that need
 * it: the server serves the shell for these and a 404 for anything else
 * (`server/src/index.ts`), the service worker falls back to the shell for
 * these only (`vite.config.ts`), and the app turns them into screens
 * (`src/lib/router.ts`). Paths are matched without a trailing slash.
 */
export const CLIENT_PATHS: readonly RegExp[] = [
  /^\/$/,
  /^\/treino$/,
  /^\/partida$/,
  /^\/partidas\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  /^\/licoes\/m\d+-l\d+$/,
  /^\/admin$/,
  /^\/redefinir$/,
];

/** `/treino/` and `/treino` are the same address. */
export function normalizePath(path: string): string {
  return path.replace(/\/+$/, "") || "/";
}

export function isClientPath(path: string): boolean {
  const normalized = normalizePath(path);
  return CLIENT_PATHS.some((pattern) => pattern.test(normalized));
}

/**
 * Where to send the browser back to after signing in elsewhere (Google): one
 * of the app's own addresses, or the root. Never a full URL or a `//host`
 * path, which would make the sign in an open redirect.
 */
export function safeReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return isClientPath(next) ? normalizePath(next) : "/";
}
