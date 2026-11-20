import { useEffect } from "react";

/**
 * Keeps the screen on while `active`, where the browser offers the Screen Wake
 * Lock API (Chrome on Android does). The browser drops the lock whenever the
 * page is hidden, so it is asked for again on coming back.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let alive = true;
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then(
        (l) => {
          if (alive) lock = l;
          else void l.release();
        },
        () => undefined,
      );
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", request);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
