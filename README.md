# Lance a Lance

Curso de xadrez do zero, em português, pensado para o celular. São 11 módulos e 59 lições curtas, com exercícios em todas, progresso salvo, XP, estrelas e um treino de puzzles com rating pessoal usando o banco aberto do Lichess.

É um **PWA instalável**, servido pelo app Node em `server/`. Abre em tela cheia, funciona sem internet e, se você entrar com uma conta, sincroniza o progresso entre os aparelhos num Postgres.

Sem conta, o app funciona normalmente e guarda tudo no `localStorage` do navegador.

## Rodando localmente

Só o app, sem servidor nem contas:

```bash
pnpm install && pnpm dev
```

Com o servidor e o banco, que é como ele roda em produção:

```bash
pnpm build && pnpm build:server && DATABASE_URL=postgres://... pnpm start
```

A primeira conta pode ser criada sem configurar nada: enquanto não existir nenhum usuário, o cadastro fica aberto. Depois ele se fecha sozinho, e só reabre com `SIGNUP_ENABLED=true`.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento (Vite) |
| `pnpm typecheck` | Checagem de tipos do app e do servidor (`tsc -b`) |
| `pnpm lint` | oxlint. Passa sem nenhum aviso |
| `pnpm validate` | Valida todo o conteúdo das lições e os puzzles (ver abaixo) |
| `pnpm build` | Gera `dist/`: o app com manifest, ícones e service worker |
| `pnpm build:server` | Compila `server/` para `server/dist` |
| `pnpm start` | Roda o servidor compilado, que serve o `dist/` e a API |
| `pnpm dev:server` | O servidor em modo watch |
| `pnpm gen:icons` | Regera os PNGs de `public/` a partir dos SVGs de `assets/` |
| `pnpm e2e:prepare` | Typecheck, validação e build. Os testes servem o `dist/` sozinhos |
| `pnpm e2e:walkthrough` | Joga as lições do começo ao fim no Chromium, em tela de celular |
| `pnpm e2e:trainer` / `e2e:history` / `e2e:auto` / `e2e:home` | Testes pontuais do treino, histórico, avanço automático e home |
| `pnpm e2e:pwa` | Manifest, ícones, service worker, fontes locais e modo offline |
| `pnpm e2e:account` | Entrar, sincronizar, sair, exportar e importar, contra um servidor de verdade |
| `pnpm e2e:reset` | Pedir o link, abrir o e-mail, trocar a senha e entrar com ela |

Validação com escopo: `ONLY=m4-l RUNS=200 pnpm validate` valida só as lições cujo id começa com `m4-l`, montando cada uma 200 vezes (cada montagem sorteia exemplos novos). `ONLY=treino` valida só os puzzles do treino.

Os testes E2E usam Playwright. Na primeira vez, rode `npx playwright install chromium`.

O `e2e:pwa` serve o `dist/` sozinho, como os outros. O `e2e:account` precisa de um servidor de pé cujo banco ainda não tenha usuários: `URL=http://127.0.0.1:3111 pnpm e2e:account`.

O `e2e:reset` precisa de um servidor com SMTP apontado para o coletor de e-mails de teste. Suba o coletor com `node tests/e2e/smtp-sink.cjs 2526 /tmp/sink.json`, depois o servidor com `SMTP_HOST=127.0.0.1 SMTP_PORT=2526 APP_URL=http://127.0.0.1:3444 SIGNUP_ENABLED=true`, e rode `URL=http://127.0.0.1:3444 SINK=/tmp/sink.json pnpm e2e:reset`.

## CI

O `.github/workflows/ci.yml` roda em todo pull request e em todo push na `main`, e não em branch solto. São dois jobs: o primeiro faz typecheck, lint, valida as 59 lições e monta o app e o servidor; o segundo roda os testes de navegador, incluindo conta e recuperação de senha contra um Postgres e um coletor de e-mail de verdade.

O `e2e:walkthrough` fica de fora, porque leva uns 12 minutos. Ele tem workflow próprio, `walkthrough.yml`, disparado à mão em Actions, com campos para escolher o commit, pular lições e rodar em modo escuro. Vale a pena para mudança no motor de lições, no tabuleiro, nas telas de exercício ou na pontuação. O conteúdo em si já é coberto pelo `pnpm validate` em todo PR.

## Deploy

O `Dockerfile` monta o PWA e o servidor numa imagem só, que sobe no Easypanel como um app service. O Node serve os arquivos estáticos e a API na mesma origem, então não tem nginx nem CORS no meio.

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Obrigatória. A string de conexão do Postgres |
| `PORT` | Padrão 3000 |
| `SIGNUP_ENABLED` | Padrão `false`. O cadastro fica aberto de qualquer jeito enquanto não houver nenhum usuário |
| `COOKIE_SECURE` | Padrão `true`, que é o certo atrás do TLS do Easypanel |
| `STATIC_DIR` | Onde está o build. Padrão `dist/` ao lado do servidor |

Para o e-mail de redefinição de senha. Sem `SMTP_HOST`, o "Esqueci a senha" não aparece na interface, em vez de aparecer e falhar:

| Variável | Para que serve |
|---|---|
| `SMTP_HOST` | O servidor de e-mail. É ele que liga ou desliga o recurso |
| `SMTP_PORT` | Padrão 587. A 465 usa TLS direto; as outras começam em claro e sobem para TLS |
| `SMTP_FROM` | O remetente. Sem ele, usa o `SMTP_USER` |
| `SMTP_USER` / `SMTP_PASS` | Autenticação. Se o `SMTP_USER` ficar vazio, conecta sem autenticar |
| `APP_URL` | O endereço público, para montar o link do e-mail |

O `APP_URL` importa: sem ele o link é montado a partir do header `Host` da requisição, que alguém pode forjar para apontar o seu e-mail de recuperação para outro domínio. Com ele setado, o link é sempre o seu endereço.

Não existe `SESSION_SECRET`: o cookie carrega só um token aleatório e opaco, e o servidor guarda apenas o hash SHA-256 dele. Não tem nada assinado, então não tem segredo para guardar nem para rotacionar.

As migrações do banco rodam sozinhas no boot. O container é sem estado, então não precisa de volume; só o Postgres precisa.

Domínio: `https://lance-a-lance.amestris.cloud`. Ainda não tem login com Google; quando tiver, vai usar `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e o callback `https://lance-a-lance.amestris.cloud/api/auth/google/callback`.

## Cópia do progresso

Nos Ajustes tem **Exportar** e **Importar**. O arquivo JSON leva o XP, as lições, os recordes e o histórico de puzzles inteiro. É a rede de segurança para o caso de o navegador limpar os dados do site, e o caminho para trazer progresso de qualquer outro lugar: o importador aceita um arquivo montado à mão, desde que o envelope bata.

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
  styles/fonts.css  as fontes que o app serve, para funcionar offline
server/src/         API Hono: contas, progresso, histórico e os arquivos estáticos
assets/             SVGs de origem do ícone
public/             ícones gerados e favicon
scripts/            validação, geração de dados e ícones
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
