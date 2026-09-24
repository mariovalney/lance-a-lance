# Lance a Lance: histórico, metodologia e decisões

Documento de passagem de bastão. Registra o que foi pedido, o que foi construído, como e por quê, e o que vem depois. Foi escrito ao migrar o projeto de uma sessão do Claude (Cowork) para um repositório que vai continuar no Claude Code.

## Sumário

1. [Resumo](#1-resumo)
2. [O pedido original e as decisões do Mário](#2-o-pedido-original-e-as-decisões-do-mário)
3. [Linha do tempo](#3-linha-do-tempo)
4. [Metodologia](#4-metodologia)
5. [Arquitetura e decisões técnicas](#5-arquitetura-e-decisões-técnicas)
6. [Currículo](#6-currículo)
7. [Dados, fontes e licenças](#7-dados-fontes-e-licenças)
8. [Problemas encontrados e como foram resolvidos](#8-problemas-encontrados-e-como-foram-resolvidos)
9. [Pontos em aberto](#9-pontos-em-aberto)
10. [O PWA, o servidor e as contas](#10-o-pwa-o-servidor-e-as-contas)
11. [A saída do Artifact](#11-a-saída-do-artifact)

## 1. Resumo

- **Produto:** curso de xadrez do zero ao intermediário, em português, focado no celular.
- **Conteúdo:** 11 módulos e 59 lições curtas, todas com exercícios interativos no tabuleiro.
- **Progresso:** XP, níveis com nomes de peças, estrelas por lição, recordes e um histórico de erros para revisar.
- **Treino de puzzles:** separado das lições, com 5.353 puzzles reais do Lichess (CC0), rating pessoal, filtros por tema e abertura e histórico completo paginado.
- **Formato:** PWA instalável servido por um app Node com Postgres, com conta, sincronização entre aparelhos e recuperação de senha por e-mail (seção 10). Nasceu como Artifact do claude.ai; esse build foi removido (seção 11).
- **Próximo passo:** subir no Easypanel em `lance-a-lance.amestris.cloud`, criar a conta e importar o progresso.

## 2. O pedido original e as decisões do Mário

Pedido inicial, resumido:

> Um artefato para estudar xadrez. Todas as lições desde o básico. Acompanhamento de avanço. Tudo com exemplo e atividades. Linguagem acessível. Aprender aberturas, o que pensar em cada momento. Tela inicial com foco em mobile, usando um framework de xadrez para o tabuleiro e um de interface, tudo componentizado. Criar a primeira lição para testar lições e pontuação. Primeiro o plano.

Decisões que ele tomou e que continuam valendo:

| Tema | Decisão |
|---|---|
| Onde salvar o progresso | No banco do Artifact (sincroniza entre aparelhos dentro do claude.ai) |
| Notação | Padrão internacional (SAN, letras em inglês), sempre com a leitura em português entre parênteses. Ex.: `Nf3 (cavalo para f3)` |
| Tamanho das lições | Bem curtas. Ele prefere fazer várias em sequência a ler muito |
| Repetição | Lições podem ser refeitas e trazem vários exemplos, sorteados a cada vez |
| Base do conteúdo | Cursos gratuitos e material livre |
| Tabuleiro | Parecido com o chess.com (ele joga lá), mas no tom **azulado** do app. O verde do chess.com foi testado e rejeitado |
| Coordenadas | Fora do tabuleiro por padrão (dá para trocar para dentro nas configurações) |
| Sons | Com efeitos sonoros (dá para desligar) |
| Avanço automático | Só dentro da lição, 1,5 s depois de cada acerto. Qualquer toque na tela pausa. Nada de avanço automático entre lições nem no treino de puzzles |
| Ordem das lições | Livre. Qualquer lição pode ser feita a qualquer hora. A primeira não feita aparece como "Próxima sugerida" |
| Sequência de dias (foguinho) | Removida da interface. Ele não quer esse sistema |
| Puzzles | Iguais ao Lichess ("as-is"): mesmos dados, temas, aberturas e informações depois de resolver |
| Contador do treino | Só "N resolvidos", sem "N/M" |
| Histórico do treino | Todas as tentativas, paginado |
| Resolver com erro | Para o rating conta como não resolvido, igual ao Lichess |
| Lançamentos | Uma versão publicada por módulo, não por tarefa |

## 3. Linha do tempo

Tudo aconteceu em setembro de 2026, numa única sessão longa (com resumos de contexto no meio).

1. **Plano.** Currículo em 11 módulos, stack (React, shadcn/ui, react-chessboard, chess.js), motor de lições orientado a dados e sistema de pontuação.
2. **Pesquisa de material livre.** Leis da FIDE em português, e-book do CAp-UERJ (CC BY 4.0), a ordem de temas do Lichess Learn e Practice, *Chess Fundamentals* de Capablanca (domínio público), banco de puzzles e nomes de aberturas do Lichess (CC0).
3. **Versões 1 e 2:** tela inicial, lição 1.1 ("Colunas, fileiras e casas") e os primeiros ajustes. O Mário aprovou a lição 1 ("está ótima").
4. **Tabuleiro no estilo chess.com:** coordenadas sempre visíveis. O tom verde foi testado e depois ele pediu a volta ao azulado.
5. **Avanço automático entre lições:** primeiro 5 s, depois 3 s.
6. **Tarefas por módulo:** uma tarefa por módulo e uma versão publicada por módulo. Os módulos 1 a 10 viraram as versões 3 a 12.
7. **Coordenadas fora do tabuleiro e sons:** os sons são sintetizados com Web Audio, sem arquivos de áudio.
8. **Avanço automático dentro da lição:**
   - Ele esclareceu que queria o avanço depois de cada acerto dentro da lição.
   - Estado final: 1,5 s dentro da lição, qualquer toque pausa, e nada entre lições.
9. **Treino de puzzles independente:** menu próprio, rating pessoal (explicado a ele como Elo) e filtros.
10. **Ajustes do treino:**
    - O banner "Ainda não" fecha sozinho (2,5 s).
    - Sem avanço automático no treino.
    - Puzzles refeitos para ficarem iguais ao Lichess: 73 temas, 86 aberturas, links para o puzzle e a partida originais.
    - Botão "Refazer", que abre em modo prática e não mexe no rating.
    - A pedido dele, os dados de treino dele foram apagados do banco. O XP das lições foi mantido.
11. **Versão 13:**
    - Módulo 11 (Finais).
    - Lições liberadas (sem bloqueio por ordem).
    - Foguinho removido da home.
    - Contador "N resolvidos".
    - Histórico completo e paginado com três estados: resolvido, com erro, solução vista.
12. **Versão 14:**
    - Lições 4.4 "Símbolos e avaliações" e 4.5 "Placar e lances ambíguos". Ele pediu uma 4.4 com tudo, e o conteúdo foi dividido em duas para manter as lições curtas.
    - Card de puzzles da home também com "N resolvidos".
    - A leitura em português passou a dizer de onde sai a peça em lances ambíguos: `Nbd2 (cavalo da coluna b para d2)`.
13. **Print da lição 4.2 sem comentário.** Ele pediu para não mexer em nada. Ver seção 9.
14. **PWA:**
    - Estimativa de esforço (seção 10).
    - Decisão de levar o código para um repositório e continuar no Claude Code.
    - Este documento, o `CLAUDE.md`, os scripts de teste e os de dados entraram no repositório nessa etapa.

## 4. Metodologia

### 4.1 Pesquisa antes de construir

O conteúdo foi escrito a partir das fontes livres da seção 7, com a ordem pedagógica inspirada no Lichess Learn (tabuleiro, peças, regras, notação, mates básicos, táticas, aberturas, meio-jogo, finais). Nomes em português seguem o uso corrente no Brasil (ex.: "cravada", "espeto", "garfo", "afogamento"). Os nomes das classificações do chess.com em português ("capivarada", "chance perdida") foram conferidos em páginas do próprio chess.com.

### 4.2 Conteúdo como dados, não como telas fixas

- Cada lição é um `LessonDef` com `build()`, que monta uma lista nova de telas a cada execução.
- Os exemplos são sorteados de geradores:
  - posições aleatórias válidas;
  - variantes espelhadas (colunas trocadas) ou com as cores invertidas;
  - pools de puzzles.
- Por isso refazer uma lição mostra posições diferentes, como o Mário pediu.
- As telas são de 9 tipos: `explain`, `tap`, `tapAll`, `choice`, `drill`, `move`, `path`, `sequence`, `play`.
- Criar conteúdo novo quase nunca exige componente novo.

### 4.3 Validação automática de todo o conteúdo

O `scripts/validate-content.ts` (com `validate-moves.ts`) monta cada lição dezenas ou centenas de vezes e verifica:

- **Posições:**
  - Todo FEN é legal.
  - O lado que não joga não pode estar em xeque: o chess.js aceita isso e gerava lances como `Rxc8#` capturando o rei.
- **Soluções:** as soluções declaradas são lances legais e passam na função `accept` da tela.
- **Caminhos:** os exercícios de caminho têm solução, com o número mínimo de lances calculado.
- **Sequências:** as linhas de lances forçados são legais do começo ao fim.
- **Mates:** "mate em N" é provado por busca (`forcedMate`), não só declarado.
- **Treino:** todos os puzzles do treino são reproduzíveis com chess.js.

Houve também checagens pontuais por força bruta. Exemplo: `scripts/check-square.ts` conferiu 450 respostas da regra do quadrado contra a busca real, com 0 divergências.

### 4.4 Testes de ponta a ponta no celular

- **Ferramenta:** Playwright com Chromium em tela de iPhone (390 x 844, toque).
- **Walkthrough:** o `walkthrough.cjs` joga as lições do começo ao fim.
  - Ele lê a resposta de cada tela no atributo `data-solution` do `<main>`.
  - Erra de propósito uma vez por lição, para testar o feedback de erro.
  - Resolve as telas de "jogue até dar mate" com uma busca de mate em 1 e em 2.
  - Registra a porcentagem final de cada lição.
- **Testes pontuais:** os outros scripts cobrem o treino, o histórico paginado, o avanço automático e a home.
- **Capturas de tela:** servem para revisar o visual (`SHOTS=1`), inclusive em modo escuro (`SCHEME=dark`).

### 4.5 Ciclo de entrega

Para cada módulo:

1. Escrever as lições.
2. Validar com muitas montagens (`RUNS` alto).
3. Rodar o walkthrough.
4. Revisar as capturas.
5. Publicar uma versão do Artifact.

As mudanças de interface pedidas no meio do caminho entraram junto com a versão seguinte.

### 4.6 Estilo de escrita

- Frases curtas, linguagem de conversa, uma ideia por tela.
- Todo lance aparece como SAN seguido da leitura em português, gerada pelo código (`describeMove`/`readMove`), nunca escrita à mão.
- Concordância automática de número e gênero (`countText`). Isso evitou erros como "São 1".
- Sem travessões e sem emojis (preferência do Mário).

## 5. Arquitetura e decisões técnicas

### 5.1 Stack

| Camada | Escolha | Por quê |
|---|---|---|
| UI | React 19 + TypeScript + Vite 8 | Padrão, rápido, tipado |
| Componentes | shadcn/ui (Radix) + Tailwind 3.4 + lucide-react | Pedido dele: um framework de interface para não errar em UI |
| Tabuleiro | react-chessboard 5.12.1 | Pedido dele: um framework de xadrez. API `options`, `squareRenderer`, arrastar e tocar |
| Regras | chess.js 1.4.0 | Lances legais, SAN, FEN. `skipValidation` para diagramas didáticos |
| Empacotamento | vite-plugin-singlefile | O Artifact precisa de um HTML único |

### 5.2 Motor de lições

- **`LessonPlayer`:** percorre as telas, soma pontos e registra os erros para a tela de resultado ("Para revisar").
- **`StepLayout`:** layout comum. Expõe `data-solution` para os testes.
- **`FeedbackBar`:**
  - Barra de acerto e erro.
  - No acerto, mostra o botão "Continuar" com contagem de 1,5 s (`AUTO_STEP_MS`). Um toque em qualquer lugar fora do botão pausa a contagem.
  - O banner de erro sem ação fecha sozinho em 2,5 s (`WRONG_BANNER_MS`).
- **Tabuleiro (`Board`, `MoveBoard`):** tocar e tocar ou arrastar, escolha de promoção, setas, marcações, último lance destacado e coordenadas fora ou dentro.
- **Adversário nas telas `play`:** uma política simples de defesa (`lib/chess/defender.ts`) responde aos lances do aluno.

### 5.3 Pontuação

| Regra | Valor |
|---|---|
| Acerto na 1ª, 2ª ou 3ª tentativa em diante | 10, 5 ou 2 pontos |
| "Toque em todas" | 10 menos 3 por toque errado (mínimo 2) |
| Estrelas | 3 a partir de 90%, 2 a partir de 70%, 1 abaixo disso |
| Níveis | o nível n começa em 50·n·(n−1) XP (0, 100, 300, 600, 1000...) |
| Nomes dos níveis | Peão (1-2), Cavalo (3-4), Bispo (5-6), Torre (7-8), Dama (9-10), Rei (11+) |
| Recordes | por exercício cronometrado (ex.: coordenadas em 30 s) |

A sequência de dias ainda é calculada no estado (`streak`), mas não aparece mais na interface.

### 5.4 Rating do treino de puzzles

- **Fórmula:** Elo simplificado. O Lichess usa Glicko-2 para puzzles, mas o Elo foi escolhido por ser simples de explicar e suficiente para uso pessoal.
- **Início e ajuste:** começa em 800, com K = 40 nos 10 primeiros puzzles (rating provisório, mostrado com "?") e K = 20 depois. O piso é 100.
- **Resultado:** só resolver sem errar conta como vitória. Errar uma vez ou ver a solução conta como derrota.
- **XP:** 10 por puzzle limpo, 3 com erro, 0 vendo a solução.
- **Modo prática:** "Refazer" e os puzzles abertos pelo histórico não mudam o rating.
- **Escolha do próximo puzzle:** perto do rating atual, com janela crescente de 75 em 75 pontos até ter opções. Evita os vistos recentemente e respeita o filtro de tema ou abertura.

### 5.5 Persistência

- **Estado (`ProgressState`, `version: 1`):** XP, lições, histórico de execuções, recordes, estatísticas do treino e `updatedAt`.
- **Dentro do claude.ai:**
  - O documento `progress/<userId>` fica no banco do Artifact (capacidades `db` e `user`).
  - Sempre há uma cópia no `localStorage` (`lance-a-lance:progress:v1`).
  - Ao abrir, vence a cópia com `updatedAt` mais novo.
- **Fora do claude.ai:** `window.claude` não existe, então o app usa só o `localStorage`.
- **Histórico do treino:**
  - É um log em blocos de 100 (`puzzlelog/<userId>_<bloco>` no banco e `lance-a-lance:puzzlelog:v1:<bloco>` no navegador).
  - Cada entrada tem id, status (`ok`, `erro`, `solucao`), variação do rating, rating depois, rating do puzzle e horário.
  - A página é lida sob demanda, das mais novas para as mais antigas.
- **Configurações:** `lance-a-lance:settings:v1` guarda as coordenadas, o som e o último filtro do treino.
- **`RemoteStore`:** a interface em `storage.ts` isola o backend. Um backend novo (seção 10) implementa `load`, `save`, `loadLog` e `saveLog`.

### 5.6 Dados do treino (`src/content/data/trainer.json`)

Listas `themes` e `openings`, e `puzzles` com campos curtos para reduzir o tamanho:

| Campo | Significado |
|---|---|
| `i` | id do puzzle no Lichess |
| `f` | FEN depois do lance do adversário que prepara o puzzle |
| `l` | esse lance do adversário (UCI), mostrado como último lance |
| `m` | solução, começando pelo aluno (UCI separados por espaço) |
| `r` | rating do puzzle |
| `t` | índices dos temas |
| `x` | 1 se termina em mate |
| `g` | caminho da partida no lichess.org |
| `o` | índice da abertura ou -1 |

### 5.7 Tamanho

O HTML publicado tem cerca de 1,5 MB, e boa parte são os puzzles.

## 6. Currículo

| Módulo | Lições |
|---|---|
| 1. O tabuleiro | 1.1 Colunas, fileiras e casas · 1.2 Cores e diagonais · 1.3 A posição inicial · 1.4 Jogando de pretas · 1.5 Desafio: coordenadas contra o relógio |
| 2. Como as peças andam | Torre · Bispo · Dama · Rei · Cavalo · Peão |
| 3. Regras essenciais | Capturar e proteger · Xeque e como sair dele · Xeque-mate · Afogamento · Roque · Promoção · En passant |
| 4. Valor das peças e notação | Quanto vale cada peça · Trocas boas e ruins · Lendo e escrevendo lances · Símbolos e avaliações · Placar e lances ambíguos |
| 5. Primeiros mates | Mate em 1 · Mate do corredor · Dama e rei contra rei · Duas torres contra rei · Torre e rei contra rei · Mate pastor e como se defender |
| 6. Como pensar a cada lance | O que o adversário ameaça? · Xeques, capturas e ameaças · Peças soltas · O checklist completo |
| 7. Princípios de abertura | Controle o centro · Desenvolva as peças · Rei seguro com o roque · Erros comuns e armadilhas |
| 8. Táticas | Garfo · Cravada · Espeto · Ataque descoberto · Xeque duplo · Remoção do defensor · Desvio |
| 9. Aberturas | Italiana · London · Gambito da Dama · Com pretas contra 1.e4 · Com pretas contra 1.d4 |
| 10. Meio-jogo | Estrutura de peões · Colunas abertas · Casas fortes · Peça boa e peça ruim · Montando um plano |
| 11. Finais | Regra do quadrado · Oposição · Rei e peão contra rei · Posição de Lucena · Posição de Philidor |

Os resumos de cada lição estão em `src/content/lessons/*` e aparecem na home.

## 7. Dados, fontes e licenças

### Fontes

- [Leis do Xadrez da FIDE, tradução oficial em português](https://arbiters.fide.com/wp-content/uploads/Publications/VariousContributions/20230101-FIDE_Laws_2023-POR.pdf)
- [Xadrez e Educação Física, e-book do CAp-UERJ (CC BY 4.0)](https://www.ppgeb.cap.uerj.br/wp-content/uploads/2021/08/2020Matheus-eBook-Xadrez.pdf)
- [Lichess Learn e Practice](https://lichess.org/practice) (ordem dos temas)
- [Chess Fundamentals, Capablanca (domínio público)](https://www.gutenberg.org/ebooks/33870)
- [Banco de puzzles do Lichess (CC0)](https://database.lichess.org/#puzzles)
- [Nomes de aberturas do Lichess (CC0)](https://github.com/lichess-org/chess-openings)
- [Classificação de lances do chess.com](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc) e [sinais de comentário](https://en.wikipedia.org/wiki/Chess_annotation_symbols) (lição 4.4)

Os textos das lições são próprios, escritos a partir dessas fontes. Se o site ficar público, os créditos da home devem continuar lá (exigência da CC BY 4.0).

### Como regenerar os dados

Os arquivos brutos do Lichess não vão para o git (pasta `data/` ignorada). Para refazer:

```bash
mkdir -p data && curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | python3 scripts/data/filter_trainer_puzzles.py data/puzzles_all.json && npx tsx scripts/curate-trainer.ts
```

```bash
mkdir -p data && curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | python3 scripts/data/filter_lesson_puzzles.py data/puzzles_raw.json && npx tsx scripts/curate-puzzles.ts
```

- **O que os filtros fazem:**
  - Leem o CSV compactado em streaming (Python com `zstandard`). O arquivo tem milhões de linhas.
  - Filtram por rating, popularidade e número de jogadas.
  - Garantem cobertura por faixa de rating e por tema.
- **O que os scripts `curate-*` fazem:** validam cada puzzle com chess.js e escrevem os JSON em `src/content/data/`.
- **Mates das lições:** `mates.json` é gerado por `scripts/gen-mates.ts`.

## 8. Problemas encontrados e como foram resolvidos

| Problema | Solução |
|---|---|
| A fórmula de cor da casa estava invertida (a1 clara) | `(coluna + 1 + fileira) % 2 === 1` |
| O chess.js aceita posição com o lado que não joga em xeque, e gerava "mates" capturando o rei | `isLegalPosition` testa também com a vez invertida. `mates.json` foi regenerado |
| Gerar exercícios de caminho era lento (1,4 s) | Alvos por passeio aleatório e um solver próprio rápido (`solvePath`) |
| O gerador de "captura segura" falhava | A verificação passou a usar a posição depois da captura |
| Risco de avançar duas vezes com toque e contagem juntos | Trava com `ref` (dispara uma vez só) |
| O texto "Responda de cabeça" aparecia em perguntas sem tabuleiro | Só aparece quando o tabuleiro fica escondido até responder |
| Frases como "São 1." | `countText(n, gênero)` |
| O filtro da API do Hugging Face não servia para os puzzles | Leitura em streaming do dump oficial do Lichess |
| O banner "Ainda não" não fechava | Fecha sozinho em 2,5 s |
| O histórico do treino guardava só 40 | Log em blocos de 100, paginado, sem limite |
| A leitura de `Nbd2` era só "cavalo para d2" | `readMove` passou a incluir a origem (coluna, fileira ou casa) |

Aprendizados que valem para frente:

- Validar tudo por código antes de olhar a tela. Quase todos os erros de conteúdo foram pegos pelo validador, não pelos testes visuais.
- Testar em tela de celular com toque. O avanço automático e o fechamento de banners só apareciam corretamente assim.
- O Mário prefere mudanças pequenas e reversíveis e dá retorno rápido. Várias decisões foram testadas e revertidas (tabuleiro verde, avanço entre lições, foguinho).

## 9. Pontos em aberto

- **Print da lição 4.2 ("Trocas boas e ruins").** Ele disse depois que era um print sem importância. Encerrado.
- **Streak de dias:** continua sendo calculado no estado, sem aparecer. Pode ser removido do código ou mantido para uso futuro.
- **Campos legados:** `history` dentro de `puzzles` não é mais escrito (o log em blocos substituiu).
- **O status `soon` ("Em breve")** existe no código, mas nenhuma lição usa mais.
- **Login com Google, para depois.** Decidido pelo Mário, sem data. Entra como um segundo caminho de entrada, ao lado do e-mail e senha, reaproveitando a mesma tabela `sessions`. O que já está definido:
  - Variáveis: `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.
  - URL de callback: `https://lance-a-lance.amestris.cloud/api/auth/google/callback`.
  - Uma conta existente com o mesmo e-mail deve ser reaproveitada, não duplicada, para não partir o progresso em duas.

Resolvido nesta etapa:

- **Lint:** `pnpm lint` passava com cerca de 20 avisos. Hoje passa com zero. O `src/components/ui` deixou de ser lintado, por ser shadcn/ui gerado.
- **Recuperação de senha:** existe, por e-mail. Ver seção 10.

## 10. O PWA, o servidor e as contas

Feito em setembro de 2026, no Claude Code, depois que o projeto veio da sessão do Cowork para o repositório.

O plano original tinha duas fases: primeiro um PWA com o progresso só no aparelho, depois login. O Mário redividiu, e com razão: a Fase A passou a subir tudo, já com Postgres, e a Fase B ficaria só o login. Na sequência ele decidiu que, se dava para já fazer com login, era melhor fazer de uma vez. Ficou uma entrega só.

### Por que assim

| Decisão | Motivo |
|---|---|
| Um container só, o Node servindo o `dist` e a API | Sem CORS, sem nginx, sem variável de domínio. O Easypanel põe o TLS na frente |
| Login com e-mail e senha, sessão em cookie `httpOnly` | Não precisa de SMTP nem de app OAuth. A única dependência externa é o Postgres |
| Hash com o `scrypt` do `node:crypto` | Nada nativo para compilar na imagem |
| Migrações em SQL, numa lista ordenada em `server/src/migrations.ts` | Sem ORM. O schema inteiro cabe num arquivo, e não tem `.sql` para copiar junto do build |
| Cadastro fechado por `SIGNUP_ENABLED`, mas aberto enquanto não houver usuário | A URL é pública. Ele sobe, cria a conta dele, e o cadastro se fecha sozinho |
| Sem `SESSION_SECRET` | O cookie carrega um token opaco, não o estado da sessão. Não tem nada para assinar. Em troca de um lookup por requisição, dá revogação imediata, que é usada ao sair e ao trocar a senha |
| Elo, cookie e chunks mantidos como estavam | O progresso real dele vive nessas chaves e nesses formatos |

### O que foi construído

1. **Dois alvos de build.** `vite.config.ts` recebe um modo. O padrão continua sendo o single-file do Artifact; `--mode pwa` gera um build normal com `vite-plugin-pwa`. O alias `virtual:fonts` decide se o build carrega as fontes ou deixa para o Google Fonts, e um plugin tira o markup do CDN do `index.html` do PWA.
2. **Fontes locais.** `src/styles/fonts.css` declara as três famílias com os nomes originais, subset latino, do `@fontsource-variable`. A Bricolage usa o corte `opsz`, que tem os mesmos dois eixos que o link do CDN pede, então o desenho das letras não muda e pesa 77 KB em vez de 132 KB.
3. **Ícone, manifest e service worker.** O cavalo é a mesma peça que os tabuleiros desenham, do react-chessboard (MIT), sobre o fundo escuro do app. Os SVGs ficam em `assets/` e o `scripts/gen-icons.mjs` rasteriza com o Chromium que os testes já usam. Tudo é precacheado: as lições e os 5.353 puzzles estão no bundle e os sons são sintetizados, então o app funciona sem rede. Uma versão nova é ativada com o app em segundo plano, nunca no meio de uma lição.
4. **Instalação.** Botão onde o navegador oferece o prompt, e uma tela explicando Compartilhar e Adicionar à Tela de Início no iPhone, onde o Safari não tem prompt.
5. **Servidor.** Hono no Node, em `server/`. Quatro tabelas: `users`, `sessions`, `progress`, `puzzle_log`. As migrações rodam no boot, numa transação e atrás de um advisory lock. As senhas usam scrypt; as sessões são tokens opacos guardados só como hash SHA-256, num cookie de 400 dias. Login errado é limitado a 10 tentativas por endereço e e-mail a cada 10 minutos.
6. **Cliente.** `connectRemote(signedIn)` escolhe o store: o banco do Artifact dentro do claude.ai, a API quando entrou, e nada fora disso, caso em que o app roda só no `localStorage`, como sempre rodou fora do claude.ai. O `AuthProvider` distingue "não tem API atrás desta página" de "ninguém entrou", e a seção de conta some inteira no primeiro caso.
7. **Exportar e importar.** O progresso inteiro num JSON, nos dois builds, nos Ajustes. É por aí que o progresso da versão 14 do Artifact vai para o app instalado. O app também pede `navigator.storage.persist()`.
8. **Recuperação de senha.** Por e-mail, com nodemailer. O token vive em `password_resets`, guardado só como hash, vale 30 minutos e serve uma vez. Gastá-lo troca a senha e apaga todas as sessões da conta, na mesma transação. O `/api/auth/forgot` responde igual exista ou não a conta, para não virar um jeito de descobrir quem está cadastrado. Sem `SMTP_HOST`, o recurso inteiro se desliga, interface incluída, em vez de aparecer e falhar.
9. **Deploy.** O `Dockerfile` monta as duas metades numa imagem só, para subir no Easypanel como um app service. O container é sem estado: não precisa de volume.

### CI

Decidido com o Mário: roda em pull request e em push na `main`, nunca em branch solto. Entram typecheck, lint, a validação das 59 lições, os dois builds e todos os testes de navegador menos um, com Postgres e coletor de e-mail de verdade nos que precisam.

O walkthrough fica fora, por levar uns 12 minutos, o que é caro demais para todo PR. Ele tem workflow próprio, disparado à mão quando a mudança é grande o bastante. A validação por código já pega quase todo erro de conteúdo sem abrir navegador, que é o argumento para essa divisão.

### Como o progresso se junta

A regra continua a mesma de antes: vence a cópia com o `updatedAt` mais novo. Na prática:

- Entrar num aparelho que já tinha progresso e numa conta vazia empurra o progresso para a conta.
- Entrar num aparelho zerado puxa o progresso da conta.
- Sair mantém a cópia local. Nada é apagado.

Um detalhe que só apareceu no teste: o documento de progresso não carrega o histórico de puzzles, que vive em documentos próprios. Sem tratar isso, entrar num aparelho que já tinha jogado deixava o histórico para trás. Agora os blocos são reconciliados na conexão, um a um, em segundo plano.

### O que fica de fora

- O login é de uma pessoa só, por desenho. Não tem convite, papel nem administração.
- Não existe `SESSION_SECRET`, e não deve existir: nada é assinado.
- A escrita do progresso é a última que chega, igual ao banco do Artifact. Como a leitura reconcilia pelo `updatedAt`, o caso de dois aparelhos ao mesmo tempo se resolve na próxima abertura.

### Referências

- [Revisiting Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria)
- [Making PWAs installable (MDN)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [Web app manifest (web.dev)](https://web.dev/learn/pwa/web-app-manifest)
- [WebKit: regra dos 7 dias e apps na tela de início](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- [Maskable icons (web.dev)](https://web.dev/articles/maskable-icon)

## 11. A saída do Artifact

O Artifact foi o formato original e o motivo de várias decisões do projeto: o HTML único, o `vite-plugin-singlefile`, as fontes vindas do Google Fonts, o banco do próprio Artifact e os testes rodando sobre um `file://`. Em setembro de 2026 o Mário decidiu aposentá-lo, e o build saiu do repositório.

O que foi removido: `build:artifact`, `scripts/to-artifact.mjs`, o `vite-plugin-singlefile`, o seletor de modo no `vite.config.ts`, o alias `virtual:fonts` com o seu `fonts-cdn.css`, os links de fonte do CDN no `index.html`, o `claude-runtime.d.ts`, o ramo do banco do Artifact no `connectRemote`, as checagens de `window.claude` e o teste `e2e:artifact`.

A parte que deu mais trabalho não foi nenhuma dessas: os testes E2E abriam um HTML único por `file://`, e `file://` não tem origem, então não tem service worker, não tem `localStorage` por site e `fetch` não funciona. Todos passaram a rodar contra o `dist/` servido por HTTP, por um servidor pequeno em `tests/e2e/env.cjs` que cada script sobe sozinho.

O progresso que vivia no banco do Artifact (993 XP, 10 lições, rating 1017 e 10 linhas de histórico) foi tirado de lá por um Claude no claude.ai, que leu o banco e montou o JSON no formato que o importador espera. As 7 primeiras linhas do histórico não existiam: são de puzzles jogados antes de o log em blocos existir, e nunca chegaram a ser gravadas. Por isso o contador diz 17 jogados e a lista mostra 10, no Artifact e no app.

