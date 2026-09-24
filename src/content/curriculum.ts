import type { LessonDef, LessonMeta, ModuleDef } from "@/content/types";
import { lessonCoordenadas } from "@/content/lessons/m1-l1-coordenadas";
import { lessonCoresDiagonais } from "@/content/lessons/m1-l2-cores-diagonais";
import { lessonPosicaoInicial } from "@/content/lessons/m1-l3-posicao-inicial";
import { lessonJogandoDePretas } from "@/content/lessons/m1-l4-jogando-de-pretas";
import { lessonDesafioRelogio } from "@/content/lessons/m1-l5-desafio-relogio";
import { lessonBispo, lessonCavalo, lessonDama, lessonRei, lessonTorre } from "@/content/lessons/m2-pieces";
import { lessonPeao } from "@/content/lessons/m2-l6-peao";
import { lessonCapturarProteger } from "@/content/lessons/m3-l1-capturar-proteger";
import { lessonXeque } from "@/content/lessons/m3-l2-xeque";
import { lessonXequeMate } from "@/content/lessons/m3-l3-xeque-mate";
import { lessonAfogamento } from "@/content/lessons/m3-l4-afogamento";
import { lessonRoque } from "@/content/lessons/m3-l5-roque";
import { lessonPromocao } from "@/content/lessons/m3-l6-promocao";
import { lessonEnPassant } from "@/content/lessons/m3-l7-en-passant";
import { lessonNotacao, lessonTrocas, lessonValor } from "@/content/lessons/m4-valor-notacao";
import { lessonDetalhesNotacao, lessonSimbolos } from "@/content/lessons/m4-simbolos";
import { lessonCorredor, lessonDamaRei, lessonDuasTorres, lessonMateEm1, lessonPastor, lessonTorreRei } from "@/content/lessons/m5-mates";
import { lessonAmeaca, lessonCCT, lessonChecklist, lessonSoltas } from "@/content/lessons/m6-pensar";
import { lessonCentro, lessonDesenvolvimento, lessonErrosAbertura, lessonReiSeguro } from "@/content/lessons/m7-abertura";
import { lessonCravada, lessonDescoberto, lessonDesvio, lessonEspeto, lessonGarfo, lessonRemocao, lessonXequeDuplo } from "@/content/lessons/m8-taticas";
import { lessonGambitoDama, lessonItaliana, lessonLondon, lessonPretasD4, lessonPretasE4 } from "@/content/lessons/m9-aberturas";
import { lessonCasasFortes, lessonColunas, lessonEstrutura, lessonPecaBoaRuim, lessonPlano } from "@/content/lessons/m10-meio-jogo";
import { lessonLucena, lessonOposicao, lessonPhilidor, lessonQuadrado, lessonReiPeao } from "@/content/lessons/m11-finais";


function ready(lesson: LessonDef): LessonMeta {
  return { id: lesson.id, title: lesson.title, summary: lesson.summary, lesson };
}

/**
 * Full learning path. Lessons without `lesson` are listed as "em breve".
 * Order follows the usual progression of Lichess Learn/Practice and the
 * FIDE laws: board, pieces, rules, mates, thinking, openings, tactics,
 * strategy and endgames.
 */
export const CURRICULUM: ModuleDef[] = [
  {
    id: "m1",
    number: 1,
    title: "O tabuleiro",
    description: "Colunas, fileiras, cores, diagonais, onde cada peça começa e o tabuleiro de pretas.",
    lessons: [
      ready(lessonCoordenadas),
      ready(lessonCoresDiagonais),
      ready(lessonPosicaoInicial),
      ready(lessonJogandoDePretas),
      ready(lessonDesafioRelogio),
    ],
  },
  {
    id: "m2",
    number: 2,
    title: "Como as peças andam",
    description: "Cada peça, uma lição, com exercícios de caminho e captura.",
    lessons: [
      ready(lessonTorre),
      ready(lessonBispo),
      ready(lessonDama),
      ready(lessonRei),
      ready(lessonCavalo),
      ready(lessonPeao),
    ],
  },
  {
    id: "m3",
    number: 3,
    title: "Regras essenciais",
    description: "Capturar, proteger, xeque, mate, afogamento e lances especiais.",
    lessons: [
      ready(lessonCapturarProteger),
      ready(lessonXeque),
      ready(lessonXequeMate),
      ready(lessonAfogamento),
      ready(lessonRoque),
      ready(lessonPromocao),
      ready(lessonEnPassant),
    ],
  },
  {
    id: "m4",
    number: 4,
    title: "Valor das peças e notação",
    description: "Quanto vale cada peça, trocas, como ler e escrever lances e os símbolos do chess.com e do Lichess.",
    lessons: [
      ready(lessonValor),
      ready(lessonTrocas),
      ready(lessonNotacao),
      ready(lessonSimbolos),
      ready(lessonDetalhesNotacao),
    ],
  },
  {
    id: "m5",
    number: 5,
    title: "Primeiros mates",
    description: "Padrões de mate e como vencer com vantagem de material.",
    lessons: [
      ready(lessonMateEm1),
      ready(lessonCorredor),
      ready(lessonDamaRei),
      ready(lessonDuasTorres),
      ready(lessonTorreRei),
      ready(lessonPastor),
    ],
  },
  {
    id: "m6",
    number: 6,
    title: "Como pensar a cada lance",
    description: "Um checklist simples para não entregar peças e achar bons lances.",
    lessons: [
      ready(lessonAmeaca),
      ready(lessonCCT),
      ready(lessonSoltas),
      ready(lessonChecklist),
    ],
  },
  {
    id: "m7",
    number: 7,
    title: "Princípios de abertura",
    description: "Centro, desenvolvimento e rei seguro nos primeiros lances.",
    lessons: [
      ready(lessonCentro),
      ready(lessonDesenvolvimento),
      ready(lessonReiSeguro),
      ready(lessonErrosAbertura),
    ],
  },
  {
    id: "m8",
    number: 8,
    title: "Táticas",
    description: "Golpes que ganham material: garfo, cravada, espeto e outros.",
    lessons: [
      ready(lessonGarfo),
      ready(lessonCravada),
      ready(lessonEspeto),
      ready(lessonDescoberto),
      ready(lessonXequeDuplo),
      ready(lessonRemocao),
      ready(lessonDesvio),
    ],
  },
  {
    id: "m9",
    number: 9,
    title: "Aberturas",
    description: "Ideias, planos e armadilhas de aberturas para brancas e pretas.",
    lessons: [
      ready(lessonItaliana),
      ready(lessonLondon),
      ready(lessonGambitoDama),
      ready(lessonPretasE4),
      ready(lessonPretasD4),
    ],
  },
  {
    id: "m10",
    number: 10,
    title: "Meio-jogo",
    description: "Estrutura de peões, colunas abertas, casas fortes e planos.",
    lessons: [
      ready(lessonEstrutura),
      ready(lessonColunas),
      ready(lessonCasasFortes),
      ready(lessonPecaBoaRuim),
      ready(lessonPlano),
    ],
  },
  {
    id: "m11",
    number: 11,
    title: "Finais",
    description: "Rei e peão, oposição e os finais de torre que todo mundo usa.",
    lessons: [
      ready(lessonQuadrado),
      ready(lessonOposicao),
      ready(lessonReiPeao),
      ready(lessonLucena),
      ready(lessonPhilidor),
    ],
  },
];

export interface LessonRef {
  module: ModuleDef;
  meta: LessonMeta;
  /** Position across the whole path (1-based within its module). */
  indexInModule: number;
}

export const ALL_LESSONS: LessonRef[] = CURRICULUM.flatMap((module) =>
  module.lessons.map((meta, i) => ({ module, meta, indexInModule: i + 1 })),
);

export function findLesson(id: string): LessonRef | undefined {
  return ALL_LESSONS.find((l) => l.meta.id === id);
}

export function lessonCode(ref: LessonRef): string {
  return `${ref.module.number}.${ref.indexInModule}`;
}
