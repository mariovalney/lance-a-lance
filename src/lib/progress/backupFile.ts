import type { BackupV2 } from "@shared/types";

/** `lance-a-lance-2026-09-24.json` */
export function backupFileName(at = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `lance-a-lance-${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}.json`;
}

/** Hands the file to the browser to save. The server builds it (`GET /api/backup`). */
export function downloadBackup(backup: BackupV2): void {
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
