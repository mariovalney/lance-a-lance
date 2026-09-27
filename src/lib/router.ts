import { useSyncExternalStore } from "react";
import { isClientPath, normalizePath } from "@shared/routes";

/**
 * Every screen has an address (the list is `shared/routes.ts`), so a reload,
 * a saved link or the back button lands where it should. No router library:
 * the History API and one hook are all it takes.
 */
export type Route =
  | { name: "home" }
  | { name: "trainer" }
  | { name: "game" }
  | { name: "gameReview"; gameId: string }
  | { name: "lesson"; lessonId: string }
  | { name: "admin" }
  | { name: "reset" };

export function parseRoute(pathname: string): Route {
  const path = normalizePath(pathname);
  if (!isClientPath(path)) return { name: "home" };
  const [, first, second] = path.split("/");
  switch (first) {
    case "treino":
      return { name: "trainer" };
    case "partida":
      return { name: "game" };
    case "partidas":
      return { name: "gameReview", gameId: second };
    case "licoes":
      return { name: "lesson", lessonId: second };
    case "admin":
      return { name: "admin" };
    case "redefinir":
      return { name: "reset" };
    default:
      return { name: "home" };
  }
}

export const paths = {
  home: "/",
  trainer: "/treino",
  game: "/partida",
  gameReview: (id: string) => `/partidas/${id}`,
  lesson: (id: string) => `/licoes/${id}`,
  admin: "/admin",
};

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

/** How deep in the app's own history this entry is: 0 for where the tab landed. */
const depth = (): number => {
  const state = window.history.state as { depth?: unknown } | null;
  return typeof state?.depth === "number" ? state.depth : 0;
};

/** Goes to an address of the app. `replace` leaves no entry for the back button. */
export function navigate(path: string, { replace = false }: { replace?: boolean } = {}): void {
  if (path === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState({ depth: depth() }, "", path);
  else window.history.pushState({ depth: depth() + 1 }, "", path);
  window.scrollTo(0, 0);
  notify();
}

/**
 * What a back arrow in the app does: the same as the browser's back button when
 * there is a screen of the app to go back to, and `fallback` otherwise (a
 * reload, or a link opened straight on this screen), without leaving the app.
 */
export function goBack(fallback: string): void {
  if (depth() > 0) window.history.back();
  else navigate(fallback, { replace: true });
}

/** The current address, as a screen. Re-renders on every navigation and on back and forward. */
export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribe, () => window.location.pathname);
  return parseRoute(pathname);
}
