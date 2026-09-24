# CLAUDE.md

Lance a Lance: a mobile-first chess course in Brazilian Portuguese (11 modules, 59 short lessons, a Lichess puzzle trainer). It is an installable PWA served by the Node app in `server/`, with accounts and Postgres. It started as a claude.ai Artifact; that build is gone, and `docs/HISTORICO.md` holds the full history and the product decisions, worth reading before changing behavior.

## Working with Mário (the owner)

- Talk to him in Portuguese. Code, code comments, commit messages and PRs in English.
- Never use em dashes or emojis in text he reads, and never in UI copy.
- CLI commands he has to run: always a single line.
- Git: NEVER squash commits. NEVER add `Co-authored-by` or any other co-authorship or attribution trailer to commits.
- He is a developer and product person: explain trade-offs briefly, cite sources for chess facts when possible.

## Commands

- `pnpm install`, then `pnpm dev`.
- `pnpm typecheck` (tsc -b). Must pass before any commit.
- `pnpm validate`: builds every lesson many times and checks all positions and solutions. Scope with `ONLY=<lesson id prefix>` (e.g. `ONLY=m4-l4`) and `RUNS=<n>`. Use `RUNS=200` for new or changed lessons. `ONLY=treino` checks the trainer puzzles only.
- `pnpm build:pwa`: the installable build, into `dist/`. `pnpm build:server` compiles `server/` into `server/dist`. `pnpm start` runs the compiled server, which serves both.
- `pnpm gen:icons`: regenerates `public/*.png` from `assets/*.svg`. Only needed after editing those SVGs.
- E2E (Playwright, run `npx playwright install chromium` once): `pnpm e2e:prepare` first, then `pnpm e2e:walkthrough` (env: `DONE` = comma list of lesson ids to mark done, `MAX_LESSONS`, `SHOTS=1`, `SCHEME=dark`), `pnpm e2e:trainer`, `pnpm e2e:history`, `pnpm e2e:auto`, `pnpm e2e:home`. Outputs go to `tests/e2e/.out/`.
- `pnpm e2e:pwa` needs `pnpm build:pwa` first and serves `dist/` itself. `pnpm e2e:account` needs a running server whose database has no users yet: `URL=http://127.0.0.1:3111 pnpm e2e:account`.

## Architecture in one screen

- Stack: React 19 + TypeScript + Vite 8 with vite-plugin-pwa, Tailwind 3.4 + shadcn/ui (Radix), lucide-react, react-chessboard 5.12.1 (`options` prop API), chess.js 1.4.0. Components use `React.FC`.
- Content is data. `src/content/curriculum.ts` lists modules and lessons. Each lesson is a `LessonDef` whose `build()` returns a fresh `Screen[]` with random examples, so repeating a lesson shows new positions.
- Screen kinds (`src/content/types.ts`): `explain`, `tap`, `tapAll`, `choice`, `drill`, `move`, `path`, `sequence`, `play`. Each has a step component in `src/components/lesson/steps/`.
- Position helpers in `src/content/lib/positions.ts`: `isLegalPosition` (also rejects the side not to move being in check), `randomVariant` (mirror files / flip colors), `withRandomKings`, `boardFor`, `afterMove`, `mateMoves`.
- Notation: always SAN followed by a Portuguese reading in parentheses, built by `describeMove` / `readMove` in `src/lib/chess/notation.ts` (e.g. `Nf3 (cavalo para f3)`, `Nbd2 (cavalo da coluna b para d2)`). Never hand-write readings that the helper can produce.
- Scoring (`src/lib/progress/scoring.ts`): 10/5/2 points by attempt, tapAll 10 minus 3 per wrong tap (min 2), stars at 90% and 70%, level n starts at 50·n·(n−1) XP. Puzzle rating: Elo from 800, K=40 for the first 10 puzzles then 20; only a clean solve counts as a win.
- Persistence (`src/lib/progress/`): `ProgressState` (version 1) mirrored in localStorage (`lance-a-lance:progress:v1`) and, when there is a cloud copy, in a document per user. Newest `updatedAt` wins. The puzzle history is a chunked log (100 entries each, localStorage `lance-a-lance:puzzlelog:v1:<chunk>`).
- `connectRemote(signedIn)` in `storage.ts` returns a `RemoteStore` over the API when somebody is signed in, and null otherwise, which leaves the app on localStorage alone.
- Accounts (`src/lib/auth/`): `AuthProvider` tells apart "no API behind this page" (a page opened from the file system) from "nobody signed in". Signing in or out changes `storageIdentity`, which makes `ProgressProvider` reconnect and reconcile, including every chunk of the puzzle log.
- Backup (`src/lib/progress/backup.ts`): export and import the whole account as one JSON file. It is the safety net for a browser that clears site data, and it accepts a file assembled by hand as long as the envelope matches.
- Keep these storage keys and document shapes backward compatible: his real progress lives in them.
- Test hooks: `main[data-solution]` (JSON with the answer for the current screen), `data-option-id`, `data-square`, `data-drill-target`, `data-promotion`, `window.__FAST_DRILL`. Keep them working when adding screen kinds; the walkthrough depends on them.

## Rules for content changes

1. Short lessons: about 6 to 9 exercises, very little reading. Accessible Portuguese, no jargon without a one-line explanation.
2. Every exercise must be verifiable: add a validator case in `scripts/validate-content.ts` if a new screen kind or rule appears.
3. Positions must be legal (`isLegalPosition`) unless the screen is an explicit teaching diagram.
4. Register new lessons in `curriculum.ts`; lesson ids are `m<module>-l<n>`.
5. Run `pnpm typecheck`, `ONLY=<id> RUNS=200 pnpm validate`, then `pnpm e2e:prepare` and a walkthrough of the touched lessons (`DONE` = every other lesson id, `MAX_LESSONS=<count>`).

## The server

- `server/src/` is Hono on Node, compiled by its own tsconfig. One process serves `dist/` and `/api` on one origin, so there is no CORS.
- Migrations are an ordered list in `server/src/migrations.ts`, applied at boot. Never edit one that has shipped: add the next one.
- Passwords use the scrypt in `node:crypto`; sessions are opaque tokens kept only as a SHA-256 hash, in an httpOnly cookie. There is no signing secret by design, so do not add one. Signup is closed by `SIGNUP_ENABLED` but always allowed while there are no users.
- Password reset needs SMTP. Without `SMTP_HOST` the whole flow, interface included, turns itself off. Reset tokens live in `password_resets`, hashed like sessions, single use, 30 minutes, and spending one signs every device out inside the same transaction that changes the password.
- `/api/auth/forgot` answers the same whether or not the address has an account, so it cannot be used to find out who is registered. Keep it that way.
- Env: `DATABASE_URL` (required), `PORT`, `SIGNUP_ENABLED`, `COOKIE_SECURE`, `STATIC_DIR`, `APP_URL`, and the `SMTP_*` block. The `Dockerfile` builds both halves into one image for Easypanel; the container is stateless.
- Local: start a Postgres, then `DATABASE_URL=... COOKIE_SECURE=false pnpm dev:server`.
- `/redefinir?token=...` is the only address the app answers besides the root, handled in `App.tsx`, not by a router.
