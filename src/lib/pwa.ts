/**
 * The bits that only matter when the app is served as a real site.
 *
 * Inside the claude.ai artifact none of this exists, and every call here is a
 * no-op, so `main.tsx` can call it unconditionally.
 */

/**
 * Asks the browser not to evict this origin's data when disk gets tight.
 *
 * Chrome grants it silently to an installed app. Safari does not honour it and
 * still clears data for a site untouched for seven days, though an app added to
 * the home screen restarts that clock on every use. The export in the settings
 * is the real safety net.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/**
 * Picks up a new deploy. The service worker is built with `registerType:
 * "prompt"`, so a new version waits instead of swapping under his feet in the
 * middle of a lesson; this activates it at the next moment the app is idle in
 * the background, and reloads once it takes over.
 */
export function watchForUpdates(): void {
  if (!("serviceWorker" in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  void navigator.serviceWorker.ready.then((registration) => {
    const activateWhenHidden = () => {
      const waiting = registration.waiting;
      if (waiting && document.visibilityState === "hidden") waiting.postMessage({ type: "SKIP_WAITING" });
    };
    registration.addEventListener("updatefound", activateWhenHidden);
    document.addEventListener("visibilitychange", activateWhenHidden);
    activateWhenHidden();
    // A phone can keep the app open for days, so look for a new build now and
    // then as well.
    setInterval(() => void registration.update().catch(() => undefined), 60 * 60 * 1000);
  });
}
