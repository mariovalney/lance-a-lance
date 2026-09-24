import type { FC } from "react";
import { ChessKnight, Trophy } from "lucide-react";
import { useProgress } from "@/lib/progress/useProgress";
import { levelProgress } from "@/lib/progress/scoring";
import { InstallButton } from "@/components/home/InstallButton";
import { SettingsButton } from "@/components/home/SettingsButton";

export const StatsHeader: FC = () => {
  const { state } = useProgress();
  const lp = levelProgress(state.xp);

  return (
    <header className="flex flex-col gap-4 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground text-background" aria-hidden>
            <ChessKnight className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <h1 className="whitespace-nowrap font-display text-[1.5rem] font-extrabold leading-none tracking-tight">Lance a Lance</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <InstallButton />
          <SettingsButton />
        </div>
      </div>

      <div className="flex flex-col justify-center gap-1.5 rounded-xl border bg-card px-3.5 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-bold">
              <Trophy className="h-4 w-4 text-gold" aria-hidden />
              Nível {lp.level} · {lp.title}
            </span>
            <span className="font-mono text-xs font-semibold tabular text-muted-foreground">
              {state.xp} XP
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div className="h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${lp.pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            Faltam <span className="font-mono font-semibold tabular">{lp.toNext}</span> XP para o nível {lp.level + 1}
          </span>
      </div>
    </header>
  );
};
