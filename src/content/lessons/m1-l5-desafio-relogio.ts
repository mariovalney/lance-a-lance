import type { LessonDef } from "@/content/types";

export const lessonDesafioRelogio: LessonDef = {
  id: "m1-l5",
  title: "Desafio: coordenadas contra o relógio",
  summary: "Quantas casas você acha em 30 segundos, de brancas e de pretas.",
  minutes: 2,
  build: () => [
    {
      kind: "explain",
      title: "Contra o relógio",
      text: "Você tem 30 segundos para tocar no maior número de casas. Errar não tira pontos, mas gasta tempo.",
      board: { marks: { e4: "focus" }, labels: { e4: "e4" } },
      tip: "Refaça este desafio sempre que quiser: seu recorde fica salvo.",
    },
    {
      kind: "drill",
      key: "drill-coordenadas-brancas",
      title: "De brancas",
      intro: "Toque em cada casa pedida o mais rápido que puder. O tempo começa quando você tocar em **Começar**.",
      orientation: "white",
      durationSec: 30,
      target: 12,
      recordLabel: "de brancas",
    },
    {
      kind: "drill",
      key: "drill-coordenadas-pretas",
      title: "De pretas",
      intro: "Agora com o tabuleiro virado, como quando você joga de pretas.",
      orientation: "black",
      durationSec: 30,
      target: 10,
      recordLabel: "de pretas",
    },
  ],
};
