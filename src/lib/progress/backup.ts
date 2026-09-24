import { emptyProgress, type ProgressState, type PuzzleLogEntry } from "@/lib/progress/types";

/**
 * A whole account in one JSON file: the progress document plus every chunk of
 * the puzzle history.
 *
 * This is how progress moves between the places the app runs, and it is the
 * safety net for the browser dropping site data. Both builds can write and read
 * it, so the version published on claude.ai exports and the PWA imports.
 */
export const BACKUP_VERSION = 1;

export interface Backup {
  app: "lance-a-lance";
  kind: "backup";
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  progress: ProgressState;
  /** Keyed by chunk number as a string, because JSON has no integer keys. */
  puzzleLog: Record<string, (PuzzleLogEntry | null)[]>;
}

export class BackupError extends Error {}

function isProgressState(value: unknown): value is ProgressState {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ProgressState).version === 1 &&
    typeof (value as ProgressState).xp === "number"
  );
}

/** Fills in anything an older or hand-edited file left out. */
function normalizeProgress(value: ProgressState): ProgressState {
  const base = emptyProgress();
  return {
    ...base,
    ...value,
    lessons: value.lessons ?? {},
    streak: { ...base.streak, ...(value.streak ?? {}) },
    history: Array.isArray(value.history) ? value.history : [],
  };
}

/** Throws a BackupError whose message is worth showing as it is. */
export function parseBackup(raw: unknown): Backup {
  if (typeof raw !== "object" || raw === null) throw new BackupError("Esse arquivo não é um backup do Lance a Lance.");
  const data = raw as Partial<Backup>;
  if (data.app !== "lance-a-lance" || data.kind !== "backup") {
    throw new BackupError("Esse arquivo não é um backup do Lance a Lance.");
  }
  if (data.version !== BACKUP_VERSION) {
    throw new BackupError(`Este backup é da versão ${String(data.version)}, e o app lê a versão ${BACKUP_VERSION}.`);
  }
  if (!isProgressState(data.progress)) throw new BackupError("O progresso dentro do arquivo está corrompido.");

  const log: Record<string, (PuzzleLogEntry | null)[]> = {};
  for (const [chunk, entries] of Object.entries(data.puzzleLog ?? {})) {
    if (!/^\d+$/.test(chunk) || !Array.isArray(entries)) throw new BackupError("O histórico de puzzles dentro do arquivo está corrompido.");
    log[chunk] = entries as (PuzzleLogEntry | null)[];
  }

  return {
    app: "lance-a-lance",
    kind: "backup",
    version: BACKUP_VERSION,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(),
    progress: normalizeProgress(data.progress),
    puzzleLog: log,
  };
}

/** `lance-a-lance-2026-09-24.json` */
export function backupFileName(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `lance-a-lance-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.json`;
}

export function downloadBackup(backup: Backup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFileName(new Date(backup.exportedAt));
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** How many puzzles a backup carries, for the confirmation message. */
export function countLoggedPuzzles(backup: Backup): number {
  return Object.values(backup.puzzleLog).reduce((total, entries) => total + entries.filter(Boolean).length, 0);
}
