import type { FC } from "react";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const SOURCES = [
  { label: "Leis do Xadrez da FIDE (tradução oficial em português)", href: "https://arbiters.fide.com/wp-content/uploads/Publications/VariousContributions/20230101-FIDE_Laws_2023-POR.pdf" },
  { label: "Xadrez e Educação Física, e-book do CAp-UERJ (CC BY 4.0)", href: "https://www.ppgeb.cap.uerj.br/wp-content/uploads/2021/08/2020Matheus-eBook-Xadrez.pdf" },
  { label: "Lichess Learn e Practice (ordem dos temas)", href: "https://lichess.org/practice" },
  { label: "Chess Fundamentals, Capablanca (domínio público)", href: "https://www.gutenberg.org/ebooks/33870" },
  { label: "Banco de puzzles do Lichess (CC0), para as táticas", href: "https://database.lichess.org/#puzzles" },
  { label: "Nomes de aberturas do Lichess (CC0)", href: "https://github.com/lichess-org/chess-openings" },
];

/** Where the lessons come from. Lives in the settings dialog, out of the way. */
export const SourcesSection: FC = () => (
  <>
    <Separator />
    <div className="flex flex-col gap-2">
      <Label className="text-[15px]">Fontes do conteúdo</Label>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        {SOURCES.map((s) => (
          <li key={s.href}>
            <a href={s.href} target="_blank" rel="noreferrer" className="underline decoration-border underline-offset-4 hover:text-foreground">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  </>
);
