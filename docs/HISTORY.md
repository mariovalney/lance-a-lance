# Lance a Lance: history, method and decisions

A handover document. It records what was asked for, what was built, how and why, and what comes next. It was written while moving the project out of a Claude session (Cowork) into a repository that would carry on in Claude Code.

Lesson titles, interface copy and the chess vocabulary stay in Portuguese throughout: they are the product.

## Contents

1. [Summary](#1-summary)
2. [The original request and Mário's decisions](#2-the-original-request-and-mários-decisions)
3. [Timeline](#3-timeline)
4. [Method](#4-method)
5. [Architecture and technical decisions](#5-architecture-and-technical-decisions)
6. [Curriculum](#6-curriculum)
7. [Data, sources and licences](#7-data-sources-and-licences)
8. [Problems hit, and how they were solved](#8-problems-hit-and-how-they-were-solved)
9. [Still open](#9-still-open)
10. [The PWA, the server and the accounts](#10-the-pwa-the-server-and-the-accounts)
11. [Retiring the artifact](#11-retiring-the-artifact)

## 1. Summary

- **Product:** a chess course from nothing to intermediate, in Brazilian Portuguese, aimed at the phone.
- **Content:** 11 modules and 59 short lessons, every one with interactive exercises on the board.
- **Progress:** XP, levels named after pieces, stars per lesson, personal records, and a list of mistakes to review.
- **Puzzle trainer:** separate from the lessons, with 5,353 real Lichess puzzles (CC0), a personal rating, filters by theme and opening, and a full paginated history.
- **Form:** an installable PWA served by a Node app with Postgres, with accounts, cross-device sync and password reset by email (section 10). It began as a claude.ai Artifact; that build has been removed (section 11).
- **Next:** deploy to Easypanel at `lance-a-lance.amestris.cloud`, create the account and import the progress.

## 2. The original request and Mário's decisions

The opening request, in short:

> An artifact for studying chess. Every lesson from the basics up. Progress tracking. Everything with examples and activities. Plain language. Learn openings, and what to think about at each moment. A home screen built for mobile, using a chess framework for the board and a UI framework, all in components. Build the first lesson to test lessons and scoring. Plan first.

Decisions he made that still hold:

| Topic | Decision |
|---|---|
| Where progress is saved | In the Artifact database (syncs across devices inside claude.ai) |
| Notation | International standard (SAN, English letters), always with the Portuguese reading in parentheses. E.g. `Nf3 (cavalo para f3)` |
| Lesson length | Very short. He would rather do several in a row than read a lot |
| Repetition | Lessons can be replayed and carry several examples, drawn fresh each time |
| Content basis | Free courses and openly licensed material |
| Board | Close to chess.com (where he plays), but in the app's **blue** tone. The chess.com green was tried and rejected |
| Coordinates | Outside the board by default (can be moved inside in the settings) |
| Sound | With sound effects (can be switched off) |
| Auto-advance | Only inside a lesson, 1.5 s after each correct answer. Any touch pauses it. No auto-advance between lessons, none in the trainer |
| Lesson order | Free. Any lesson at any time. The first unplayed one shows as "Próxima sugerida" |
| Day streak | Removed from the interface. He does not want that system |
| Puzzles | As Lichess has them: same data, themes, openings and post-solve information |
| Trainer counter | Just "N resolvidos", no "N/M" |
| Trainer history | Every attempt, paginated |
| Solving after a mistake | Counts as unsolved for the rating, like Lichess |
| Releases | One published version per module, not per task |

## 3. Timeline

All of it happened in September 2026, in one long session (with context summaries along the way).

1. **The plan.** An 11-module curriculum, the stack (React, shadcn/ui, react-chessboard, chess.js), a data-driven lesson engine and a scoring system.
2. **Research into free material.** The FIDE laws in Portuguese, the CAp-UERJ ebook (CC BY 4.0), the topic order from Lichess Learn and Practice, Capablanca's *Chess Fundamentals* (public domain), and the Lichess puzzle database and opening names (CC0).
3. **Versions 1 and 2:** the home screen, lesson 1.1 ("Colunas, fileiras e casas") and the first adjustments. Mário approved lesson 1 ("está ótima").
4. **A chess.com style board:** coordinates always visible. The green tone was tried, then he asked for the blue back.
5. **Auto-advance between lessons:** 5 s at first, then 3 s.
6. **One task per module:** one task and one published version per module. Modules 1 to 10 became versions 3 to 12.
7. **Coordinates outside the board, and sound:** the sounds are synthesized with Web Audio, with no audio files.
8. **Auto-advance inside a lesson:**
   - He clarified that he wanted the advance after each correct answer within a lesson.
   - Where it landed: 1.5 s inside a lesson, any touch pauses it, nothing between lessons.
9. **A standalone puzzle trainer:** its own menu, a personal rating (explained to him as Elo) and filters.
10. **Trainer adjustments:**
    - The "Ainda não" banner closes itself (2.5 s).
    - No auto-advance in the trainer.
    - Puzzles rebuilt to match Lichess: 73 themes, 86 openings, links to the original puzzle and game.
    - A "Refazer" button, which opens in practice mode and leaves the rating alone.
    - At his request, his trainer data was wiped from the database. The lesson XP was kept.
11. **Version 13:**
    - Module 11 (Endgames).
    - Lessons unlocked (no ordering gate).
    - The day streak removed from the home.
    - The "N resolvidos" counter.
    - A full paginated history with three states: solved, with a mistake, solution seen.
12. **Version 14:**
    - Lessons 4.4 "Símbolos e avaliações" and 4.5 "Placar e lances ambíguos". He asked for a 4.4 with everything in it, and the content was split in two to keep the lessons short.
    - The home's puzzle card also got "N resolvidos".
    - The Portuguese reading started saying where the piece comes from on ambiguous moves: `Nbd2 (cavalo da coluna b para d2)`.
13. **A screenshot of lesson 4.2 with no comment.** He asked that nothing be touched. See section 9.
14. **PWA:**
    - An effort estimate (section 10).
    - The decision to move the code into a repository and carry on in Claude Code.
    - This document, `CLAUDE.md`, the test scripts and the data scripts entered the repository at this point.

## 4. Method

### 4.1 Research before building

The content was written from the free sources in section 7, with the teaching order drawn from Lichess Learn (board, pieces, rules, notation, basic mates, tactics, openings, middlegame, endgames). The Portuguese terms follow ordinary Brazilian usage ("cravada", "espeto", "garfo", "afogamento"). The Portuguese names of the chess.com move classifications ("capivarada", "chance perdida") were checked against chess.com's own pages.

### 4.2 Content as data, not as fixed screens

- Each lesson is a `LessonDef` with a `build()` that assembles a fresh list of screens on every run.
- Examples are drawn from generators:
  - valid random positions;
  - mirrored variants (files swapped) or colour-flipped ones;
  - puzzle pools.
- That is why replaying a lesson shows different positions, as Mário asked.
- There are 9 screen kinds: `explain`, `tap`, `tapAll`, `choice`, `drill`, `move`, `path`, `sequence`, `play`.
- New content almost never needs a new component.

### 4.3 Automatic validation of all the content

`scripts/validate-content.ts` (with `validate-moves.ts`) builds every lesson tens or hundreds of times and checks:

- **Positions:**
  - Every FEN is legal.
  - The side not to move cannot be in check: chess.js accepts that, and it produced moves like `Rxc8#` capturing the king.
- **Solutions:** the declared solutions are legal moves and pass the screen's `accept` function.
- **Paths:** the path exercises have a solution, with the minimum number of moves computed.
- **Sequences:** the forced lines are legal from start to finish.
- **Mates:** "mate in N" is proved by search (`forcedMate`), not merely declared.
- **Trainer:** every trainer puzzle replays under chess.js.

There were also one-off brute-force checks. For example, `scripts/check-square.ts` compared 450 answers of the square rule against the real search, with 0 disagreements.

### 4.4 End to end tests at phone size

- **Tool:** Playwright with Chromium at iPhone size (390 x 844, touch).
- **Walkthrough:** `walkthrough.cjs` plays the lessons from start to finish.
  - It reads each screen's answer from the `data-solution` attribute on `<main>`.
  - It gets one answer wrong on purpose per lesson, to exercise the error feedback.
  - It solves the "play until mate" screens with a mate-in-1 and mate-in-2 search.
  - It records the final percentage of each lesson.
- **Focused checks:** the other scripts cover the trainer, the paginated history, the auto-advance and the home.
- **Screenshots:** for reviewing the look (`SHOTS=1`), including dark mode (`SCHEME=dark`).

### 4.5 Delivery cycle

For each module:

1. Write the lessons.
2. Validate with many builds (a high `RUNS`).
3. Run the walkthrough.
4. Review the screenshots.
5. Publish a version of the Artifact.

Interface changes asked for along the way shipped with the following version.

### 4.6 Writing style

- Short sentences, conversational, one idea per screen.
- Every move appears as SAN followed by the Portuguese reading, generated by code (`describeMove`/`readMove`), never written by hand.
- Automatic number and gender agreement (`countText`). That put an end to mistakes like "São 1".
- No em dashes and no emoji (Mário's preference).

## 5. Architecture and technical decisions

### 5.1 Stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript + Vite 8 | Standard, fast, typed |
| Components | shadcn/ui (Radix) + Tailwind 3.4 + lucide-react | His request: a UI framework, so the interface would not go wrong |
| Board | react-chessboard 5.12.1 | His request: a chess framework. The `options` API, `squareRenderer`, drag and tap |
| Rules | chess.js 1.4.0 | Legal moves, SAN, FEN. `skipValidation` for teaching diagrams |
| Bundling | vite-plugin-singlefile | The Artifact needed a single HTML file. Removed with the artifact, see section 11; the build is now vite-plugin-pwa |

### 5.2 Lesson engine

- **`LessonPlayer`:** walks the screens, adds up points and records the mistakes for the result screen ("Para revisar").
- **`StepLayout`:** the shared layout. It exposes `data-solution` for the tests.
- **`FeedbackBar`:**
  - The right and wrong bar.
  - On a correct answer it shows the "Continuar" button with a 1.5 s countdown (`AUTO_STEP_MS`). A touch anywhere outside the button pauses it.
  - The wrong banner with no action closes itself after 2.5 s (`WRONG_BANNER_MS`).
- **Board (`Board`, `MoveBoard`):** tap-tap or drag, promotion choice, arrows, marks, the last move highlighted, and coordinates inside or outside.
- **The opponent on `play` screens:** a simple defensive policy (`lib/chess/defender.ts`) answers the student's moves.

### 5.3 Scoring

| Rule | Value |
|---|---|
| Right on the 1st, 2nd, or 3rd try onwards | 10, 5 or 2 points |
| "Tap them all" | 10 minus 3 per wrong tap (minimum 2) |
| Stars | 3 from 90%, 2 from 70%, 1 below that |
| Levels | level n starts at 50·n·(n−1) XP (0, 100, 300, 600, 1000...) |
| Level names | Peão (1-2), Cavalo (3-4), Bispo (5-6), Torre (7-8), Dama (9-10), Rei (11+) |
| Records | per timed exercise (e.g. coordinates in 30 s) |

The day streak is still computed in the state (`streak`), but no longer appears in the interface.

### 5.4 The trainer rating

- **Formula:** simplified Elo. Lichess uses Glicko-2 for puzzles, but Elo was chosen because it is easy to explain and enough for personal use.
- **Start and adjustment:** it starts at 800, with K = 40 for the first 10 puzzles (a provisional rating, shown with a "?") and K = 20 after that. The floor is 100.
- **Result:** only a clean solve counts as a win. One mistake, or seeing the solution, counts as a loss.
- **XP:** 10 for a clean puzzle, 3 with a mistake, 0 for seeing the solution.
- **Practice mode:** "Refazer" and puzzles opened from the history do not move the rating.
- **Picking the next puzzle:** close to the current rating, with a window growing 75 points at a time until there are options. It avoids recently seen ones and respects the theme or opening filter.

### 5.5 Persistence

- **State (`ProgressState`, `version: 1`):** XP, lessons, run history, records, trainer statistics and `updatedAt`.
- **Inside claude.ai** (historical, see section 11):
  - The `progress/<userId>` document lived in the Artifact database (the `db` and `user` capabilities).
  - There was always a copy in `localStorage` (`lance-a-lance:progress:v1`).
  - On open, the copy with the newer `updatedAt` won.
- **Outside claude.ai:** `window.claude` did not exist, so the app used `localStorage` alone.
- **Trainer history:**
  - A log in chunks of 100 (`puzzlelog/<userId>_<chunk>` in the database and `lance-a-lance:puzzlelog:v1:<chunk>` in the browser).
  - Each entry has the id, the status (`ok`, `erro`, `solucao`), the rating change, the rating after, the puzzle rating and the time.
  - A page is read on demand, newest to oldest.
- **Settings:** `lance-a-lance:settings:v1` holds the coordinates, the sound and the last trainer filter.
- **`RemoteStore`:** the interface in `storage.ts` isolates the backend. A new backend (section 10) implements `load`, `save`, `loadLog` and `saveLog`.

### 5.6 Trainer data (`src/content/data/trainer.json`)

The `themes` and `openings` lists, and `puzzles` with short field names to keep the size down:

| Field | Meaning |
|---|---|
| `i` | the puzzle's Lichess id |
| `f` | the FEN after the opponent move that sets the puzzle up |
| `l` | that opponent move (UCI), shown as the last move |
| `m` | the solution, starting with the student (UCI separated by spaces) |
| `r` | the puzzle's rating |
| `t` | theme indices |
| `x` | 1 if it ends in mate |
| `g` | the game's path on lichess.org |
| `o` | the opening index, or -1 |

### 5.7 Size

The published HTML was about 1.5 MB, most of it the puzzles.

## 6. Curriculum

| Module | Lessons |
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

Each lesson's summary lives in `src/content/lessons/*` and shows on the home screen.

## 7. Data, sources and licences

### Sources

- [FIDE Laws of Chess, official Portuguese translation](https://arbiters.fide.com/wp-content/uploads/Publications/VariousContributions/20230101-FIDE_Laws_2023-POR.pdf)
- [Xadrez e Educação Física, a CAp-UERJ ebook (CC BY 4.0)](https://www.ppgeb.cap.uerj.br/wp-content/uploads/2021/08/2020Matheus-eBook-Xadrez.pdf)
- [Lichess Learn and Practice](https://lichess.org/practice) (the topic order)
- [Chess Fundamentals, Capablanca (public domain)](https://www.gutenberg.org/ebooks/33870)
- [The Lichess puzzle database (CC0)](https://database.lichess.org/#puzzles)
- [Lichess opening names (CC0)](https://github.com/lichess-org/chess-openings)
- [chess.com move classification](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc) and [annotation symbols](https://en.wikipedia.org/wiki/Chess_annotation_symbols) (lesson 4.4)

The lesson texts are original, written from those sources. If the site goes public, the credits on the home screen have to stay there (a CC BY 4.0 requirement).

### Regenerating the data

The raw Lichess files are not committed (the `data/` folder is ignored). To rebuild them:

```bash
mkdir -p data && curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | python3 scripts/data/filter_trainer_puzzles.py data/puzzles_all.json && npx tsx scripts/curate-trainer.ts
```

```bash
mkdir -p data && curl -sL https://database.lichess.org/lichess_db_puzzle.csv.zst | python3 scripts/data/filter_lesson_puzzles.py data/puzzles_raw.json && npx tsx scripts/curate-puzzles.ts
```

- **What the filters do:**
  - Read the compressed CSV as a stream (Python with `zstandard`). The file has millions of rows.
  - Filter by rating, popularity and number of moves.
  - Guarantee coverage across rating bands and themes.
- **What the `curate-*` scripts do:** validate every puzzle with chess.js and write the JSON into `src/content/data/`.
- **Lesson mates:** `mates.json` is generated by `scripts/gen-mates.ts`.

## 8. Problems hit, and how they were solved

| Problem | Fix |
|---|---|
| The square colour formula was inverted (a1 light) | `(file + 1 + rank) % 2 === 1` |
| chess.js accepts a position with the side not to move in check, and produced "mates" that captured the king | `isLegalPosition` also tests with the turn flipped. `mates.json` was regenerated |
| Generating path exercises was slow (1.4 s) | Targets by random walk, and a fast solver of our own (`solvePath`) |
| The "safe capture" generator was wrong | The check now uses the position after the capture |
| Risk of advancing twice when a touch and the countdown coincided | A `ref` latch (fires once) |
| "Responda de cabeça" appeared on questions with no board | It only appears when the board is hidden until you answer |
| Phrases like "São 1." | `countText(n, gender)` |
| The Hugging Face API filter was no good for the puzzles | Streaming the official Lichess dump instead |
| The "Ainda não" banner would not close | It closes itself after 2.5 s |
| The trainer history kept only 40 entries | A log in chunks of 100, paginated, with no limit |
| `Nbd2` read as just "cavalo para d2" | `readMove` now includes the origin (file, rank or square) |

Lessons worth carrying forward:

- Validate everything in code before looking at the screen. Almost every content bug was caught by the validator, not by the visual tests.
- Test at phone size with touch. The auto-advance and the self-closing banners only behaved correctly there.
- Mário prefers small, reversible changes and gives feedback fast. Several decisions were tried and reverted (the green board, advancing between lessons, the day streak).

## 9. Still open

- **The screenshot of lesson 4.2 ("Trocas boas e ruins").** He later said it was a screenshot of no importance. Closed.
- **The day streak:** still computed in the state, never shown. It can be dropped from the code or kept for later.
- **Legacy fields:** `history` inside `puzzles` is no longer written (the chunked log replaced it).
- **The `soon` status ("Em breve")** exists in the code, but no lesson uses it any more.
Settled since:

- **Lint:** `pnpm lint` used to pass with about 20 warnings. It now passes with none. `src/components/ui` stopped being linted, being generated shadcn/ui.
- **Password reset:** it exists, by email. See section 10.
- **Google sign-in:** built. See section 13.

## 10. The PWA, the server and the accounts

Built in September 2026, in Claude Code, after the project came out of the Cowork session and into the repository.

The original plan had two phases: first a PWA with progress on the device only, then sign-in. Mário redrew the line, and rightly: phase A would deploy everything, Postgres included, and phase B would be sign-in alone. He then decided that if it could be done with sign-in from the start, better to do it in one go. It became a single delivery.

### Why it is shaped this way

| Decision | Reason |
|---|---|
| One container, Node serving `dist` and the API | No CORS, no nginx, no domain variable. Easypanel puts TLS in front |
| Email and password, session in an `httpOnly` cookie | No SMTP and no OAuth app needed. The only external dependency is Postgres |
| Hashing with the `scrypt` in `node:crypto` | Nothing native to compile in the image |
| Migrations as SQL, in an ordered list in `server/src/migrations.ts` | No ORM. The whole schema fits in one file, and there are no `.sql` files to copy alongside the build |
| Signup closed by `SIGNUP_ENABLED`, but open while there are no users | The URL is public. He deploys, claims his account, and signup closes itself. Section 14 replaced the variable with the admin page |
| No `SESSION_SECRET` | The cookie carries an opaque token, not the session state. There is nothing to sign. In exchange for one lookup per request it gives immediate revocation, which is used on sign-out and on a password change |
| Elo, cookie and chunks kept as they were | His real progress lives in those keys and those shapes |

### What was built

1. **Two build targets.** `vite.config.ts` took a mode. The default stayed the Artifact single file; `--mode pwa` produced a normal build with `vite-plugin-pwa`. The `virtual:fonts` alias decided whether the build shipped the fonts or left them to Google Fonts, and a small plugin stripped the CDN markup out of the PWA's `index.html`. (The artifact half is gone, see section 11.)
2. **Local fonts.** `src/styles/fonts.css` declares the three families under their plain names, latin subset only, from `@fontsource-variable`. Bricolage uses the `opsz` cut, which carries the same two axes the CDN link asked for, so the lettering does not change, at 77 KB instead of 132 KB.
3. **Icon, manifest and service worker.** The knight is the same piece the boards draw, from react-chessboard (MIT), on the app's dark background. The SVGs live in `assets/` and `scripts/gen-icons.mjs` rasterizes them with the Chromium the tests already use. Everything is precached: the lessons and the 5,353 puzzles are in the bundle and the sounds are synthesized, so the app works with no network. A new version is activated while the app sits in the background, never mid-lesson.
4. **Installing.** A button where the browser offers a prompt, and a screen explaining Share and Add to Home Screen on the iPhone, where Safari has no prompt.
5. **Server.** Hono on Node, in `server/`. Four tables: `users`, `sessions`, `progress`, `puzzle_log`. The migrations run at boot, in a transaction and behind an advisory lock. Passwords use scrypt; sessions are opaque tokens stored only as a SHA-256 hash, in a 400-day cookie. A wrong sign-in is limited to 10 attempts per address and email per 10 minutes.
6. **Client.** `connectRemote(signedIn)` picks the store: the API when signed in, and nothing otherwise, in which case the app runs on `localStorage` alone. `AuthProvider` tells "there is no API behind this page" apart from "nobody is signed in", and the account section disappears entirely in the first case.
7. **Export and import.** The whole progress as one JSON file, in the settings. It is how the version 14 artifact progress reached the installed app. The app also asks for `navigator.storage.persist()`.
8. **Password reset.** By email, with nodemailer. The token lives in `password_resets`, stored only as a hash, valid for 30 minutes and good once. Spending it changes the password and deletes every session of the account, in the same transaction. `/api/auth/forgot` answers the same whether or not the account exists, so it cannot become a way to find out who is registered. Without `SMTP_HOST` the whole feature turns itself off, interface included, rather than appearing and failing.
9. **Deploy.** The `Dockerfile` puts both halves into one image, to run on Easypanel as an app service. The container is stateless: it needs no volume.

### CI

Decided with Mário: it runs on pull requests and on pushes to `main`, never on a working branch. It covers typecheck, lint, the validation of the 59 lessons, both builds and every browser check but one, with a real Postgres and a real mail sink where they are needed.

The walkthrough stays out, taking about twelve minutes, which is too expensive for every pull request. It has its own workflow, triggered by hand when a change is big enough to deserve it. Validation in code already catches almost every content bug without opening a browser, which is the argument for the split.

### How progress merges

This is how it worked while the app could be used without an account. Section 12 replaced it.

The rule is the one from before: the copy with the newer `updatedAt` wins. In practice:

- Signing in on a device that already has progress, to an empty account, pushes the progress up to the account.
- Signing in on an empty device pulls the account's progress down.
- Signing out keeps the local copy. Nothing is deleted.

One detail that only showed up under test: the progress document does not carry the puzzle history, which lives in documents of its own. Without handling that, signing in on a device that had already played left its history behind. The chunks are now reconciled on connect, one at a time, in the background.

### What is deliberately missing

- Sign-in is for one person, by design. There are no invitations, roles or administration.
- There is no `SESSION_SECRET`, and there should not be: nothing is signed.
- A progress write is last-one-wins, as the Artifact database was. Because a read reconciles by `updatedAt`, two devices at once sort themselves out on the next open.

### References

- [Revisiting Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria)
- [Making PWAs installable (MDN)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [Web app manifest (web.dev)](https://web.dev/learn/pwa/web-app-manifest)
- [WebKit: the 7 day rule and home screen apps](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- [Maskable icons (web.dev)](https://web.dev/articles/maskable-icon)

## 11. Retiring the artifact

The Artifact was the original form, and the reason behind several of the project's decisions: the single HTML file, `vite-plugin-singlefile`, the fonts coming from Google Fonts, the Artifact's own database, and the tests running over a `file://` page. In September 2026 Mário decided to retire it, and the build left the repository.

What went: `build:artifact`, `scripts/to-artifact.mjs`, `vite-plugin-singlefile`, the mode switch in `vite.config.ts`, the `virtual:fonts` alias with its `fonts-cdn.css`, the CDN font links in `index.html`, `claude-runtime.d.ts`, the Artifact branch of `connectRemote`, the `window.claude` checks and the `e2e:artifact` test.

The part that took the work was none of those: the E2E tests opened a single HTML file over `file://`, and `file://` has no origin, so no service worker, no per-site `localStorage` and no working `fetch`. They all moved onto `dist/` served over HTTP, by a small server in `tests/e2e/env.cjs` that each script starts for itself.

The progress that lived in the Artifact database (993 XP, 10 lessons, a rating of 1017 and 10 history rows) was pulled out by a Claude on claude.ai, which read the database and assembled the JSON in the shape the importer expects. The first 7 history rows did not exist: they are puzzles played before the chunked log existed, and were never written. That is why the counter said 17 played while the list showed 10, in the Artifact and in the app. On import the counters were recomputed from the 10 rows that survived, starting from the ordinary 800, so the history has no hole in it.

## 12. The app behind the account

In September 2026, after a session where the badge said "Neste aparelho" and the progress was still on screen after signing out, Mário asked two things in a row: make signing in mandatory, and, once that was settled, stop keeping a copy in the browser at all when there is a database.

The badge went first. It had five states and two of them printed the same words, so it said "Neste aparelho" both for "you are not signed in" and for "the cloud refused a write". Neither is something the reader can act on, and with an account always required the first one stops existing. There is no badge now: a failed write is caught by the next one or by the load on the next boot.

Then the browser copy. It was the app's memory before there were accounts, and it stayed on as a mirror afterwards, which made two problems:

- On a browser two people share, the copy had no owner. Whoever signed in next found it, and because the reconcile compared `updatedAt`, one person's XP could be pushed into another person's account.
- It made the account the second source of truth instead of the only one.

The first version of the fix tagged the copy with the account that owned it. Mário went further: with a database, the browser keeps nothing. So `ProgressProvider` only writes to `localStorage` when the page has no API behind it, which is the static host the browser checks serve. Behind an account, what would be the browser's copy is a `Map` in memory, thrown away with the tab, and the puzzle log pages come from the account.

That leaves one thing to get right. A dead `fetch` means two opposite things: on a static host there is no API to reach and progress is in the browser, while on the real site it means the phone is offline and there is nothing here to show. They cannot be told apart at the moment of failure, so the app remembers, in `lance-a-lance:api:v1`, that this origin answered JSON once. After that a dead fetch is `ApiOffline` and the app says "Sem conexão" with a way to try again, instead of opening an empty course that looks like lost progress. Before that, and it can only be before the first successful load, it is `ApiUnavailable` and the browser is the store.

The cost is the offline promise, and it was accepted knowingly: an installed app with no network now opens on the offline screen rather than on the cached course. The alternative kept a copy in the browser, which is exactly what was being removed.

Signing out clears whatever progress keys the browser still holds. Nothing is written there while an account is open, so what it finds is a copy from before this change, and leaving the app leaves nothing behind. Sound and board coordinates stay: they are the device's, not the account's.

## 13. Signing in with Google

A second way in, beside email and password, on the same `sessions` table. The variables and the callback had been decided long before: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `https://lance-a-lance.amestris.cloud/api/auth/google/callback`.

### The shape

The ordinary authorization code flow, with the app as a confidential client: `/api/auth/google` redirects to Google, `/api/auth/google/callback` does the rest server side, where the client secret is. Nothing about the identity is decided in the browser.

The `state` is a random value in a short lived `httpOnly` cookie, compared against the `state` Google echoes back. That is the double-submit cookie pattern, and it is here for the same reason there is no `SESSION_SECRET`: nothing needs to be signed, so no secret needs to be kept. A callback whose `state` is missing or different is refused before anything is looked up.

The identity is read from the userinfo endpoint rather than from the id token. It costs one more request to Google and saves verifying a signature against a key set that rotates, which is the part that fails quietly months later. The three Google URLs are configurable, which is what lets the test drive a fake Google; production never sets them.

### Linking, and why it is gated on `email_verified`

An account that already holds the address is reused, never duplicated. The owner has one account with all his progress in it, and the app has no way to merge two.

But linking only happens when Google reports the address as verified. Without that rule, anyone who can make a Google account claiming an address would be handed the account that holds it here. That is the whole attack, and it is cheap: the refusal is worth more than the convenience. An unverified email is refused outright, and nothing is created for it.

So the callback has four cases, in order: a known identity signs its user in; a new identity with a verified email that matches an account links to it; a new identity with a verified email and no account creates one, if signing up is open at all; an unverified email is refused. Section 14 closed that third case down to the very first account. Every refusal lands back on the sign in screen with a sentence in Portuguese, through `/?erro=<code>`, rather than on a JSON error page.

### The schema

`users.password` became nullable, because an account made through Google has none. The code had to match: verifying a password against a null is false, not a crash.

The subject went into `user_identities (user_id, provider, subject)`, keyed on `(provider, subject)`, rather than a `google_sub` column on `users`. It holds a second provider without another migration, it keeps `users` about the person rather than about how they got in, and it makes "which accounts have Google" a row count instead of a null check.

### Testing it without Google

`tests/e2e/google-sink.cjs` is a fake Google, the same idea as the SMTP sink: authorize, token and userinfo, plus a control endpoint where the test says who the next person to authorize is. No signatures, no TLS. The server points at it through the three URL variables, so no test-only branch exists in the production path.

The test covers a new account, the same identity coming back to it, a verified email linking to a password account with its progress intact, an unverified email refused, a `state` that does not match and one that is missing, and, by starting a second server with no `GOOGLE_CLIENT_ID`, the feature turning itself off with the email form still there.

## 14. The admin, and only the addresses the app answers

Two things on the same evening, once the accounts had a second way in.

### One admin, and accounts by address

The app had no notion of who owns it. The lever was `SIGNUP_ENABLED`, which is a blunt one: on, anybody with the address makes an account; off, nobody does, including the people Mário wants in. He asked for a column on the user, an `/admin` page with the list, and "cadastro de email apenas", creating a person by address alone.

`users.is_admin` is that column, and the first account created is it. The migration promotes the oldest account, which on this deploy is his; on an empty database nothing is promoted and the first account to be created becomes the admin instead. It is the same rule that already let the first signup through with signup closed, so there is no new idea to remember and no `ADMIN_EMAIL` to keep in step with the database.

With that, `SIGNUP_ENABLED` went away. Signing up is now possible only while there are no users at all. Everyone else is liberated at `/admin`, one address at a time, which creates a row in `users` with the address and nothing else: no password, no identity.

That account is already reachable, and this is the part worth keeping in mind, because it is why there is no invitation table and no temporary password. `users.password` became nullable for Google, and the reset link already sets a password on an account that has none. So a liberated address gets in either with Google, if that address is their Google account, or by asking for a password on the sign in screen. Both paths existed; the admin page only decides who may use them. Google refuses an address nobody liberated, for the same reason a password would.

The page shows, per person, how they get in, their XP, the lessons they have finished and when they were last seen, and it can promote, demote and delete. Never itself, in any of the three: the app must never be left without an admin. `isAdmin` opens that page and grants nothing else, so there is still no notion of roles anywhere in the app.

### Only three addresses

Mário noticed that `/dsdsdsds` served the app, as did every other address. That is the ordinary single page application arrangement, and it was wrong here: the app answers three addresses and nothing else, so anything else is a typo or a probe.

`CLIENT_ROUTES` in the server is now the list, and everything else gets `public/404.html` with a 404. The part that is easy to miss is the service worker: with `navigateFallback` alone it answers any navigation with the cached shell, so an installed app would keep showing the app for addresses the server refuses. `navigateFallbackAllowlist` holds the same three. The list therefore lives in three places, and the comment in each names the other two.
