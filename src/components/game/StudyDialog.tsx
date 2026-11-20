import { useState, type FC } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RichText } from "@/components/common/RichText";
import { AssistedSwitch, LevelPicker } from "@/components/game/parts";
import { numberedMove } from "@/components/game/text";
import { moveLabel } from "@/components/lesson/steps/moveText";
import { useProgress } from "@/lib/progress/useProgress";
import type { Game } from "@/lib/progress/types";
import { ApiError } from "@/lib/auth/api";
import { navigate, paths } from "@/lib/router";

type Status = "idle" | "starting" | "failed" | "open";

/**
 * Starts a study game from the position on the review's board, after the first
 * `ply` moves of `game`: the same side, a level and the assistance to choose,
 * never rated. The game screen takes it from there.
 */
export const StudyDialog: FC<{ open: boolean; onOpenChange: (open: boolean) => void; game: Game; ply: number }> = ({ open, onOpenChange, game, ply }) => {
  const { state, games } = useProgress();
  const [level, setLevel] = useState(game.level);
  const [assisted, setAssisted] = useState(game.assisted);
  const [status, setStatus] = useState<Status>("idle");
  const start = numberedMove(game.moves, ply);
  // One open game at a time: the one in progress has to end first.
  const busy = state.games.current !== null || status === "open";

  const change = (next: boolean) => {
    if (status === "starting") return;
    if (!next) setStatus("idle");
    onOpenChange(next);
  };

  const begin = async () => {
    setStatus("starting");
    try {
      await games.start({ level, player: game.player, assisted, from: { game: game.id, ply } });
      navigate(paths.game);
    } catch (error) {
      setStatus(error instanceof ApiError && error.code === "game_open" ? "open" : "failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent className="max-w-[22rem] rounded-2xl" data-study-dialog>
        <DialogHeader>
          <DialogTitle className="font-display">Jogar a partir daqui</DialogTitle>
          <DialogDescription>
            {busy ? (
              "Termine ou abandone a partida em andamento antes."
            ) : start ? (
              <RichText text={`Começa depois de ${start.number} ${moveLabel(start.move)}. Partida de estudo, não vale rating.`} />
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {!busy && (
          <div className="flex flex-col gap-4">
            <LevelPicker level={level} onLevel={(l) => setLevel(l.rating)} />
            <AssistedSwitch id="study-assisted" checked={assisted} onChange={setAssisted} />
          </div>
        )}
        {status === "failed" && <p className="text-sm text-danger">A partida não começou. Confira a conexão.</p>}
        <DialogFooter>
          {busy ? (
            <Button className="h-11 w-full rounded-xl font-bold" onClick={() => navigate(paths.game)}>
              Ir para a partida
            </Button>
          ) : (
            <Button className="h-11 w-full rounded-xl font-bold" disabled={status === "starting"} onClick={() => void begin()}>
              {status === "starting" && <Loader2 className="!h-4 !w-4 animate-spin" />}
              Começar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
