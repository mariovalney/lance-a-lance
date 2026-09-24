import { useCallback, useEffect, useRef, useState } from "react";

interface Countdown {
  /** 0 to 1. */
  progress: number;
  secondsLeft: number;
  running: boolean;
  cancel: () => void;
}

/**
 * Runs `onDone` after `durationMs`, unless cancelled.
 * Uses a plain interval (animation frames can be paused inside embedded viewers).
 */
export function useCountdown(durationMs: number, onDone: () => void, enabled = true): Countdown {
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(enabled);
  // Kept in a ref so that a new `onDone` identity does not restart the interval.
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const id = window.setInterval(() => {
      const p = Math.min((Date.now() - start) / durationMs, 1);
      setProgress(p);
      if (p >= 1) {
        window.clearInterval(id);
        setRunning(false);
        doneRef.current();
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [running, durationMs]);

  const cancel = useCallback(() => {
    setRunning(false);
    setProgress(0);
  }, []);

  return {
    progress,
    secondsLeft: Math.max(1, Math.ceil(((1 - progress) * durationMs) / 1000)),
    running,
    cancel,
  };
}
