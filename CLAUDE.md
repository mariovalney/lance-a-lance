# CLAUDE.md

Lance a Lance: a mobile-first chess course in Brazilian Portuguese (11 modules, 59 short lessons, a Lichess puzzle trainer). It started as a claude.ai Artifact and is moving to an installable PWA. Read `docs/HISTORICO.md` for the full history, the product decisions and the PWA plan before changing behavior.

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
- `pnpm build:artifact`: single-file build for claude.ai (`artifact/lance-a-lance.html`).
- E2E (Playwright, run `npx playwright install chromium` once): `pnpm e2e:prepare` first, then `pnpm e2e:walkthrough` (env: `DONE` = comma list of lesson ids to mark done, `MAX_LESSONS`, `SHOTS=1`, `SCHEME=dark`), `pnpm e2e:trainer`, `pnpm e2e:history`, `pnpm e2e:auto`, `pnpm e2e:home`. Outputs go to `tests/e2e/.out/`.

## Architecture in one screen

- Stack: React 19 + TypeScript + Vite 8, Tailwind 3.4 + shadcn/ui (Radix), lucide-react, react-chessboard 5.12.1 (`options` prop API), chess.js 1.4.0. Components use `React.FC`.
- Content is data. `src/content/curriculum.ts` lists modules and lessons. Each lesson is a `LessonDef` whose `build()` returns a fresh `Screen[]` with random examples, so repeating a lesson shows new positions.
- Screen kinds (`src/content/types.ts`): `explain`, `tap`, `tapAll`, `choice`, `drill`, `move`, `path`, `sequence`, `play`. Each has a step component in `src/components/lesson/steps/`.
- Position helpers in `src/content/lib/positions.ts`: `isLegalPosition` (also rejects the side not to move being in check), `randomVariant` (mirror files / flip colors), `withRandomKings`, `boardFor`, `afterMove`, `mateMoves`.
- Notation: always SAN followed by a Portuguese reading in parentheses, built by `describeMove` / `readMove` in `src/lib/chess/notation.ts` (e.g. `Nf3 (cavalo para f3)`, `Nbd2 (cavalo da coluna b para d2)`). Never hand-write readings that the helper can produce.
- Scoring (`src/lib/progress/scoring.ts`): 10/5/2 points by attempt, tapAll 10 minus 3 per wrong tap (min 2), stars at 90% and 70%, level n starts at 50·n·(n−1) XP. Puzzle rating: Elo from 800, K=40 for the first 10 puzzles then 20; only a clean solve counts as a win.
- Persistence (`src/lib/progress/`): `ProgressState` (version 1) mirrored in localStorage (`lance-a-lance:progress:v1`) and, inside claude.ai, in the Artifact DB doc `progress/<userId>`. Newest `updatedAt` wins. The puzzle history is a chunked log (`puzzlelog/<userId>_<chunk>`, 100 entries each, localStorage `lance-a-lance:puzzlelog:v1:<chunk>`). `RemoteStore` in `storage.ts` is the seam for any new backend.
- Keep these storage keys and document shapes backward compatible: his real progress lives in them.
- Test hooks: `main[data-solution]` (JSON with the answer for the current screen), `data-option-id`, `data-square`, `data-drill-target`, `data-promotion`, `window.__FAST_DRILL`. Keep them working when adding screen kinds; the walkthrough depends on them.

## Rules for content changes

1. Short lessons: about 6 to 9 exercises, very little reading. Accessible Portuguese, no jargon without a one-line explanation.
2. Every exercise must be verifiable: add a validator case in `scripts/validate-content.ts` if a new screen kind or rule appears.
3. Positions must be legal (`isLegalPosition`) unless the screen is an explicit teaching diagram.
4. Register new lessons in `curriculum.ts`; lesson ids are `m<module>-l<n>`.
5. Run `pnpm typecheck`, `ONLY=<id> RUNS=200 pnpm validate`, then `pnpm e2e:prepare` and a walkthrough of the touched lessons (`DONE` = every other lesson id, `MAX_LESSONS=<count>`).

## Publishing the claude.ai Artifact

Claude Code cannot publish Artifacts. After changes, run `pnpm build:artifact` and ask Claude in Cowork or claude.ai to republish `artifact/lance-a-lance.html` to https://claude.ai/artifact/MKZsV5N99grYPgmKnrb61A (capabilities `db` and `user`).
