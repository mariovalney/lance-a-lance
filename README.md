# Lance a Lance

A chess course from scratch, in Brazilian Portuguese, built for the phone. Eleven modules and 59 short lessons, every one of them with exercises, plus saved progress, XP, stars and a puzzle trainer with a personal rating drawn from the open Lichess database.

It is an **installable PWA**, served by the Node app in `server/`. It opens full screen and keeps your progress in Postgres, the same on every device you sign in on.

The whole app sits behind an account: with no session, the first screen is the sign in screen. Behind an account the account is the only copy of the progress, and the browser keeps none: what would be the local copy is held in memory for the visit and thrown away with the tab. A server that cannot be reached therefore has nothing to show, and the app says "Sem conexão" instead of opening an empty course. The exception is a page with no API behind it, a static host with no Node server, where there is no account to sign in to and progress does stay in that browser. That is how the browser checks serve the build.

## Running it locally

Just the app, no server and no accounts:

```bash
pnpm install && pnpm dev
```

With the server and the database, which is how it runs in production:

```bash
pnpm build && pnpm build:server && DATABASE_URL=postgres://... pnpm start
```

The first account needs no configuration: while there are no users, signup stays open. That account claims the deploy and is the admin. After it, signing up is closed for good, and people are let in one address at a time at `/admin`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server (Vite) |
| `pnpm typecheck` | Types, for the app and the server (`tsc -b`) |
| `pnpm lint` | oxlint. Passes with no warnings at all |
| `pnpm validate` | Checks all the lesson content and the puzzles (see below) |
| `pnpm build` | Produces `dist/`: the app with its manifest, icons and service worker |
| `pnpm build:server` | Compiles `server/` into `server/dist` |
| `pnpm start` | Runs the compiled server, which serves `dist/` and the API |
| `pnpm dev:server` | The server in watch mode |
| `pnpm gen:icons` | Regenerates the PNGs in `public/` from the SVGs in `assets/` |
| `pnpm e2e:prepare` | Typecheck, validate and build. The tests serve `dist/` themselves |
| `pnpm e2e:walkthrough` | Plays the lessons end to end in Chromium, at phone size |
| `pnpm e2e:trainer` / `e2e:history` / `e2e:auto` / `e2e:home` | Focused checks of the trainer, the history, the auto-advance and the home |
| `pnpm e2e:pwa` | Manifest, icons, service worker, local fonts and offline mode |
| `pnpm e2e:account` | Sign in, sync, sign out, export and import, against a real server |
| `pnpm e2e:reset` | Ask for the link, open the mail, change the password and sign in with it |
| `pnpm e2e:google` | Sign in with Google against a fake Google: new account, linking, refusals |
| `pnpm e2e:admin` | The accounts page, who may open it, and the addresses the app answers |

Scoped validation: `ONLY=m4-l RUNS=200 pnpm validate` checks only the lessons whose id starts with `m4-l`, building each one 200 times (every build draws fresh examples). `ONLY=treino` checks only the trainer puzzles.

The E2E scripts use Playwright. The first time, run `npx playwright install chromium`.

`e2e:pwa` serves `dist/` itself, like the rest. `e2e:account` needs a running server that still accepts signups: `URL=http://127.0.0.1:3111 pnpm e2e:account`.

`e2e:reset` needs a server whose SMTP points at the throwaway mail sink. Start the sink with `node tests/e2e/smtp-sink.cjs 2526 /tmp/sink.json`, then the server with `SMTP_HOST=127.0.0.1 SMTP_PORT=2526 APP_URL=http://127.0.0.1:3444`, and run `URL=http://127.0.0.1:3444 SINK=/tmp/sink.json pnpm e2e:reset`.

`e2e:account` and `e2e:admin` want the same sink, because an address the admin liberates only gets a password through the link. Without `SINK` they skip the parts that need a second person to sign in. All of them bootstrap the admin themselves: they sign up when the database is empty, and sign in as that account when it is not.

`e2e:google` needs the same kind of arrangement, with a fake Google in place of the mail sink. Start it with `GOOGLE_CLIENT_ID=test-client-id GOOGLE_CLIENT_SECRET=test-client-secret node tests/e2e/google-sink.cjs 2626`, start the server with those same two variables plus `GOOGLE_AUTH_URL=http://127.0.0.1:2626/authorize GOOGLE_TOKEN_URL=http://127.0.0.1:2626/token GOOGLE_USERINFO_URL=http://127.0.0.1:2626/userinfo`, and run `URL=http://127.0.0.1:3111 GOOGLE=http://127.0.0.1:2626 DATABASE_URL=postgres://... pnpm e2e:google`. The `DATABASE_URL` is what lets it start a second server with no `GOOGLE_CLIENT_ID`, to check the feature turns itself off; without it that one check is skipped.

## CI

`.github/workflows/ci.yml` runs on every pull request and on every push to `main`, and on no other branch. Two jobs: the first typechecks, lints, validates the 59 lessons and builds the app and the server; the second runs the browser checks, including accounts and password reset against a real Postgres and a real mail sink.

`e2e:walkthrough` stays out of it, because it takes about twelve minutes. It has its own workflow, `walkthrough.yml`, triggered by hand from Actions, with fields for the commit, the lessons to skip and the colour scheme. It is worth running for a change to the lesson engine, the board, the exercise screens or the scoring. The content itself is already covered by `pnpm validate` on every pull request.

## Deploy

The `Dockerfile` puts the PWA and the server into a single image, which runs on Easypanel as one app service. Node serves the static files and the API from the same origin, so there is no nginx and no CORS in between.

| Variable | What it is for |
|---|---|
| `DATABASE_URL` | Required. The Postgres connection string |
| `PORT` | Defaults to 3000 |
| `COOKIE_SECURE` | Defaults to `true`, which is right behind Easypanel's TLS |
| `STATIC_DIR` | Where the build is. Defaults to `dist/` next to the server |

For the password reset email. Without `SMTP_HOST`, "Esqueci a senha" does not appear in the interface at all, rather than appearing and failing:

| Variable | What it is for |
|---|---|
| `SMTP_HOST` | The mail server. This is what turns the feature on or off |
| `SMTP_PORT` | Defaults to 587. Port 465 is implicit TLS; the others start plain and upgrade |
| `SMTP_FROM` | The sender. Without it, `SMTP_USER` is used |
| `SMTP_USER` / `SMTP_PASS` | Authentication. With an empty `SMTP_USER` it connects unauthenticated |
| `APP_URL` | The public address, used to build the link in the email |

`APP_URL` matters: without it the link is built from the request's `Host` header, which someone can forge to point your own reset email at their domain. With it set, the link is always your address. Signing in with Google uses it for the same reason, to build the callback.

For signing in with Google. Without `GOOGLE_CLIENT_ID` the button does not appear in the interface at all, the same way:

| Variable | What it is for |
|---|---|
| `GOOGLE_CLIENT_ID` | The OAuth client. This is what turns the feature on or off |
| `GOOGLE_CLIENT_SECRET` | The secret of that client. The code is exchanged server side |

The flow is the ordinary authorization code one: `/api/auth/google` sets a random `state` in a short lived cookie and redirects to Google; `/api/auth/google/callback` compares the `state` it gets back against that cookie, exchanges the code for a token, reads the identity from Google and opens the usual session. An account that already has the address is reused rather than duplicated, and only when Google says the address is verified. A refusal lands back on the sign in screen with a sentence, not on a JSON page.

There is no `SESSION_SECRET`: the cookie carries nothing but an opaque random token, and the server stores only its SHA-256 hash. Nothing is signed, so there is no secret to keep or to rotate.

The database migrations run themselves at boot. The container is stateless, so it needs no volume; only Postgres does.

The home screen footer shows the first seven characters of the commit the build came from. Easypanel hands that commit to the `Dockerfile` as the `GIT_SHA` build arg; outside it, the build reads the checkout instead. It is a build arg, not a runtime variable: the value goes into the bundle while the image is being built.

Domain: `https://lance-a-lance.amestris.cloud`. The Google callback registered there is `https://lance-a-lance.amestris.cloud/api/auth/google/callback`.

## Who gets in

The first account created claims the deploy and is the admin. After that, signing up is closed: the admin opens `/admin` and liberates one address at a time. That creates an account with the address and nothing else.

The person then gets in one of two ways, both already there: with Google, if that address is their Google account, or by asking for a password on the sign in screen, which sends them the same link the password reset uses. There is no invitation to accept and no temporary password to pass along.

The page lists everyone with how they get in, their XP, how many lessons they have finished and when they were last seen. It can promote somebody to admin, take it back, and delete an account, which takes its progress and its puzzle history with it. The admin cannot demote or delete itself, so the app is never left without one.

The app answers three addresses: `/`, `/redefinir` and `/admin`. Anything else is a 404, rather than the app pretending the address exists.

## Copying your progress

The settings hold **Exportar** and **Importar**. The JSON file carries the XP, the lessons, the records and the whole puzzle history. It is the safety net for a browser that clears site data, and the way to bring progress in from anywhere else: the importer accepts a file assembled by hand, as long as the envelope matches. **Zerar progresso** sits right under them, since the export is what makes throwing everything away safe.

## Layout

```
src/
  content/          content as data: curriculum, lessons, positions, puzzles
    lessons/        one lesson (or one group) per file, mN-...
    lib/            position generators, analysis, pawn structures
    data/           mates.json, puzzles.json (lessons), trainer.json (trainer)
  components/       UI: board, exercise screens, home, result, trainer
  lib/auth/         accounts: session state and the API calls
  lib/chess/        rules and helpers over chess.js (mate search, notation)
  lib/progress/     state, scoring, rating, persistence and export
  styles/fonts.css  the fonts the app serves, so it works offline
server/src/         Hono API: accounts, progress, history and the static files
assets/             source SVGs for the icon
public/             generated icons and favicon
scripts/            validation, data and icon generation
scripts/data/       filters over the official Lichess puzzle CSV
tests/e2e/          Playwright scripts
docs/HISTORY.md     the full history, the method and the decisions
```

## Content sources and licences

- FIDE Laws of Chess (official Portuguese translation)
- Xadrez e Educação Física, a CAp-UERJ ebook (CC BY 4.0)
- Lichess Learn and Practice (the order of the topics)
- Chess Fundamentals, Capablanca (public domain)
- The Lichess puzzle database (CC0) and the Lichess opening names (CC0)

The links are in the app's settings (`src/components/home/SourcesSection.tsx`).

The knight in the icon is the same piece the boards draw, from react-chessboard (MIT).
