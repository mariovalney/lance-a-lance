import { useEffect, useState, type FC } from "react";
import { Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Chrome fires this when the app meets the install criteria. */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // iOS does not report the display mode, but it does set this.
  (navigator as { standalone?: boolean }).standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Offers to install the app.
 *
 * Android and desktop Chrome hand over a prompt, so it is one tap. Safari has
 * no such thing and only installs through the share sheet, so on an iPhone this
 * explains where to tap. Shows nothing when the app is already installed.
 */
export const InstallButton: FC = () => {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [installed, setInstalled] = useState(() => typeof window === "undefined" || standalone());

  const servedAsSite = typeof navigator !== "undefined" && "serviceWorker" in navigator;

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || !servedAsSite) return null;
  // No prompt and not an iPhone means the browser has already decided this is
  // not installable, so do not offer something that would do nothing.
  if (!prompt && !isIOS()) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full"
        aria-label="Instalar o app"
        onClick={async () => {
          if (!prompt) {
            setShowIOS(true);
            return;
          }
          await prompt.prompt();
          const { outcome } = await prompt.userChoice;
          if (outcome === "accepted") setInstalled(true);
          setPrompt(null);
        }}
      >
        <Download className="!h-5 !w-5" />
      </Button>
      <Dialog open={showIOS} onOpenChange={setShowIOS}>
        <DialogContent className="max-w-[22rem] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Instalar no iPhone</DialogTitle>
            <DialogDescription>O app fica na tela de início, abre em tela cheia e carrega na hora.</DialogDescription>
          </DialogHeader>
          <ol className="flex flex-col gap-3 text-[15px]">
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">1</span>
              <span className="flex items-center gap-1.5">
                Toque em Compartilhar
                <Share className="h-4 w-4 text-primary" aria-hidden />
              </span>
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">2</span>
              Role e toque em Adicionar à Tela de Início
            </li>
            <li className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">3</span>
              Confirme em Adicionar
            </li>
          </ol>
        </DialogContent>
      </Dialog>
    </>
  );
};
