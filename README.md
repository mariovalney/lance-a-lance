# Lance a Lance

Curso de xadrez do zero, em português, pensado para o celular. São 11 módulos e 59 lições curtas, com exercícios em todas, progresso salvo, XP, estrelas e um treino de puzzles com rating pessoal usando o banco aberto do Lichess.

Hoje o app roda como um **Artifact do claude.ai**: um único arquivo HTML publicado, com o progresso salvo no banco do Artifact. O próximo passo planejado é virar um **PWA instalável** (ver `docs/HISTORICO.md`, seção "Próximos passos").

## Rodando localmente

```bash
pnpm install
pnpm dev
```

Fora do claude.ai o app funciona normalmente e salva o progresso só no `localStorage` do navegador.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento (Vite) |
| `pnpm typecheck` | Checagem de tipos (`tsc -b`) |
| `pnpm validate` | Valida todo o conteúdo das lições e os puzzles (ver abaixo) |
| `pnpm build:artifact` | Gera `artifact/lance-a-lance.html`, o formato publicado no claude.ai |
| `pnpm e2e:prepare` | Typecheck, validação, build e página de teste em `tests/e2e/.out/skeleton.html` |
| `pnpm e2e:walkthrough` | Joga as lições do começo ao fim no Chromium, em tela de celular |
| `pnpm e2e:trainer` / `e2e:history` / `e2e:auto` / `e2e:home` | Testes pontuais do treino, histórico, avanço automático e home |

Validação com escopo: `ONLY=m4-l RUNS=200 pnpm validate` valida só as lições cujo id começa com `m4-l`, montando cada uma 200 vezes (cada montagem sorteia exemplos novos). `ONLY=treino` valida só os puzzles do treino.

Os testes E2E usam Playwright. Na primeira vez, rode `npx playwright install chromium`.

## Estrutura

```
src/
  content/          conteúdo como dados: currículo, lições, posições, puzzles
    lessons/        uma lição (ou um grupo) por arquivo, mN-...
    lib/            geradores de posições, análise, estruturas de peões
    data/           mates.json, puzzles.json (lições), trainer.json (treino)
  components/       UI: tabuleiro, telas de exercício, home, resultado, treino
  lib/chess/        regras e utilidades sobre chess.js (busca de mate, notação)
  lib/progress/     estado, pontuação, rating e persistência (DB do Artifact + localStorage)
scripts/            validação, geração de dados e conversão para Artifact
scripts/data/       filtros do CSV oficial de puzzles do Lichess
tests/e2e/          scripts Playwright
docs/HISTORICO.md   histórico completo, metodologia, decisões e próximos passos
```

## Fontes e licenças do conteúdo

- Leis do Xadrez da FIDE (tradução oficial em português)
- Xadrez e Educação Física, e-book do CAp-UERJ (CC BY 4.0)
- Lichess Learn e Practice (ordem dos temas)
- Chess Fundamentals, Capablanca (domínio público)
- Banco de puzzles do Lichess (CC0) e nomes de aberturas do Lichess (CC0)

Os links estão na home do app (`src/components/home/HomeScreen.tsx`).
