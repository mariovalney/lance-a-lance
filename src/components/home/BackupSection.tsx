import { useRef, useState, type FC } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BackupError, countLoggedPuzzles, downloadBackup, parseBackup } from "@/lib/progress/backup";
import { useProgress } from "@/lib/progress/useProgress";

type Note = { tone: "ok" | "bad"; text: string } | null;

/**
 * Exports and imports the whole progress as one JSON file, in both builds. This
 * is how progress moves from the version published on claude.ai to the
 * installed app, and the safety net for a browser that clears site data.
 */
export const BackupSection: FC = () => {
  const { exportBackup, importBackup } = useProgress();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [note, setNote] = useState<Note>(null);

  const doExport = async () => {
    setBusy("export");
    setNote(null);
    try {
      const backup = await exportBackup();
      downloadBackup(backup);
      const puzzles = countLoggedPuzzles(backup);
      setNote({ tone: "ok", text: `Arquivo salvo com ${backup.progress.xp} XP e ${puzzles} ${puzzles === 1 ? "puzzle" : "puzzles"}.` });
    } catch {
      setNote({ tone: "bad", text: "Não deu para montar o arquivo." });
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setBusy("import");
    setNote(null);
    try {
      const backup = parseBackup(JSON.parse(await file.text()));
      const puzzles = countLoggedPuzzles(backup);
      await importBackup(backup);
      setNote({ tone: "ok", text: `Importado: ${backup.progress.xp} XP e ${puzzles} ${puzzles === 1 ? "puzzle" : "puzzles"}.` });
    } catch (failure) {
      const text =
        failure instanceof BackupError ? failure.message : failure instanceof SyntaxError ? "Esse arquivo não é um JSON válido." : "Não deu para importar.";
      setNote({ tone: "bad", text });
    } finally {
      setBusy(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <>
      <Separator />
      <div className="flex flex-col gap-2">
        <Label className="text-[15px]">Cópia do progresso</Label>
        <p className="text-xs text-muted-foreground">
          Um arquivo com o seu XP, as lições, os recordes e o histórico de puzzles. Importar substitui o que está aqui.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="gap-2" disabled={busy !== null} onClick={doExport}>
            {busy === "export" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
            Exportar
          </Button>
          <Button variant="outline" className="gap-2" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
            {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
            Importar
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void doImport(file);
          }}
        />
        {note && (
          <p role="status" className={note.tone === "ok" ? "text-xs text-muted-foreground" : "text-xs font-medium text-destructive"}>
            {note.text}
          </p>
        )}
      </div>
    </>
  );
};
