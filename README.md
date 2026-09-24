# Lance a Lance

Curso de xadrez do zero, em português, pensado para o celular. São 11 módulos e 59 lições curtas, com exercícios em todas, progresso salvo, XP, estrelas e um treino de puzzles com rating pessoal usando o banco aberto do Lichess.

O mesmo código sai de duas formas:

- **PWA instalável**, servido pelo app Node em `server/`. Abre em tela cheia, funciona sem internet e, se você entrar com uma conta, sincroniza o progresso entre os aparelhos num Postgres.
- **Artifact do claude.ai**, um único arquivo HTML, com o progresso no banco do próprio Artifact.

Sem conta e fora do claude.ai, o app funciona normalmente e guarda tudo no `localStorage` do navegador.

## Rodando localmente

Só o app, sem servidor nem contas:

```bash
pnpm install && pnpm dev
```

Com o servidor e o banco, que é como ele roda em produção:

```bash
pnpm build:pwa && pnpm build:server && DATABASE_URL=postgres://... pnpm start
```

A primeira conta pode ser criada sem configurar nada: enquanto não existir nenhum usuário, o cadastro fica aberto. Depois ele se fecha sozinho, e só reabre com `SIGNUP_ENABLED=true`.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento (Vite) |
| `pnpm typecheck` | Checagem de tipos do app e do servidor (`tsc -b`) |
| `pnpm lint` | oxlint. Passa sem nenhum aviso |
| `pnpm validate` | Valida todo o conteúdo das lições e os puzzles (ver abaixo) |
| `pnpm build:pwa` | Gera `dist/`: o PWA com manifest, ícones e service worker |
| `pnpm build:server` | Compila `server/` para `server/dist` |
| `pnpm start` | Roda o servidor compilado, que serve o `dist/` e a API |
| `pnpm dev:server` | O servidor em modo watch |
| `pnpm build:artifact` | Gera `artifact/lance-a-lance.html`, o formato publicado no claude.ai |
| `pnpm gen:icons` | Regera os PNGs de `public/` a partir dos SVGs de `assets/` |
| `pnpm e2e:prepare` | Typecheck, validação, build e página de teste em `tests/e2e/.out/skeleton.html` |
| `pnpm e2e:walkthrough` | Joga as lições do começo ao fim no Chromium, em tela de celular |
| `pnpm e2e:trainer` / `e2e:history` / `e2e:auto` / `e2e:home` | Testes pontuais do treino, histórico, avanço automático e home |
| `pnpm e2e:pwa` | Manifest, ícones, service worker, fontes locais e modo offline |
| `pnpm e2e:account` | Entrar, sincronizar, sair, exportar e importar, contra um servidor de verdade |

Validação com escopo: `ONLY=m4-l RUNS=200 pnpm validate` valida só as lições cujo id começa com `m4-l`, montando cada uma 200 vezes (cada montagem sorteia exemplos novos). `ONLY=treino` valida só os puzzles do treino.

Os testes E2E usam Playwright. Na primeira vez, rode `npx playwright install chromium`.

O `e2e:pwa` serve o `dist/` sozinho, então só precisa de `pnpm build:pwa` antes. O `e2e:account` precisa de um servidor de pé cujo banco ainda não tenha usuários: `URL=http://127.0.0.1:3111 pnpm e2e:account`.

## Deploy

O `Dockerfile` monta o PWA e o servidor numa imagem só, que sobe no Easypanel como um app service. O Node serve os arquivos estáticos e a API na mesma origem, então não tem nginx nem CORS no meio.

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Obrigatória. A string de conexão do Postgres |
| `PORT` | Padrão 3000 |
| `SIGNUP_ENABLED` | Padrão `false`. O cadastro fica aberto de qualquer jeito enquanto não houver nenhum usuário |
| `COOKIE_SECURE` | Padrão `true`, que é o certo atrás do TLS do Easypanel |
| `STATIC_DIR` | Onde está o build. Padrão `dist/` ao lado do servidor |

As migrações do banco rodam sozinhas no boot.

Domínio: `https://lance-a-lance.amestris.cloud`. Ainda não tem login com Google; quando tiver, vai usar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e o callback `https://lance-a-lance.amestris.cloud/api/auth/google/callback`.

## Cópia do progresso

Nos Ajustes tem **Exportar** e **Importar**, nos dois builds. O arquivo JSON leva o XP, as lições, os recordes e o histórico de puzzles inteiro. É por aí que o progresso do Artifact publicado vai para o app instalado, e é a rede de segurança para o caso de o navegador limpar os dados do site.

## Estrutura

```
src/
  content/          conteúdo como dados: currículo, lições, posições, puzzles
    lessons/        uma lição (ou um grupo) por arquivo, mN-...
    lib/            geradores de posições, análise, estruturas de peões
    data/           mates.json, puzzles.json (lições), trainer.json (treino)
  components/       UI: tabuleiro, telas de exercício, home, resultado, treino
  lib/auth/         conta: estado de sessão e chamadas à API
  lib/chess/        regras e utilidades sobre chess.js (busca de mate, notação)
  lib/progress/     estado, pontuação, rating, persistência e exportação
  styles/fonts.css  as fontes locais do PWA
server/src/         API Hono: contas, progresso, histórico e os arquivos estáticos
assets/             SVGs de origem do ícone
public/             ícones gerados e favicon
scripts/            validação, geração de dados e ícones, conversão para Artifact
scripts/data/       filtros do CSV oficial de puzzles do Lichess
tests/e2e/          scripts Playwright
docs/HISTORICO.md   histórico completo, metodologia e decisões
```

## Fontes e licenças do conteúdo

- Leis do Xadrez da FIDE (tradução oficial em português)
- Xadrez e Educação Física, e-book do CAp-UERJ (CC BY 4.0)
- Lichess Learn e Practice (ordem dos temas)
- Chess Fundamentals, Capablanca (domínio público)
- Banco de puzzles do Lichess (CC0) e nomes de aberturas do Lichess (CC0)

Os links estão na home do app (`src/components/home/HomeScreen.tsx`).

O cavalo do ícone é a mesma peça que os tabuleiros desenham, vinda do react-chessboard (MIT).
