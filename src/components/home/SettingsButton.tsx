import { useState, type FC } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Board } from "@/components/board/Board";
import { AccountSection } from "@/components/home/AccountSection";
import { BackupSection } from "@/components/home/BackupSection";
import { updateSettings, useSettings } from "@/lib/settings";
import { playSound } from "@/lib/sound";

export const SettingsButton: FC = () => {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={() => setOpen(true)} aria-label="Ajustes">
        <Settings2 className="!h-5 !w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] max-w-[24rem] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Ajustes</DialogTitle>
            <DialogDescription>Som e tabuleiro valem só para este aparelho.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="setting-sound" className="flex flex-col gap-0.5 text-[15px]">
                Efeitos sonoros
                <span className="text-xs font-normal text-muted-foreground">Lances, acertos, erros e lição concluída.</span>
              </Label>
              <Switch
                id="setting-sound"
                checked={settings.sound}
                onCheckedChange={(v) => {
                  updateSettings({ sound: v });
                  if (v) playSound("correct");
                }}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-[15px]">Letras e números do tabuleiro</Label>
              <ToggleGroup
                type="single"
                value={settings.coords}
                onValueChange={(v) => v && updateSettings({ coords: v as "outside" | "inside" })}
                className="grid grid-cols-2 gap-2"
              >
                <ToggleGroupItem value="outside" className="h-10 rounded-xl border data-[state=on]:border-primary data-[state=on]:bg-primary/10">
                  Fora
                </ToggleGroupItem>
                <ToggleGroupItem value="inside" className="h-10 rounded-xl border data-[state=on]:border-primary data-[state=on]:bg-primary/10">
                  Dentro
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="mx-auto w-40">
                <Board spec={{ marks: { e4: "focus" } }} />
              </div>
            </div>
            <AccountSection />
            <BackupSection />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
