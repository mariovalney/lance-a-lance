// A game against the computer, on the real engine and the real server: the card
// on the home opens it, the engine answers, a reload keeps both the screen and
// the game, abandoning a rated game costs rating, a game with one move is
// called off, an assisted game shows the best move and is not rated, and the
// history lists the games and replays one.
//
//   URL=http://127.0.0.1:3111 pnpm e2e:game
const { chromium } = require("playwright");
(async () => {
  const { OUT, signedIn } = require("./env.cjs");
  const b = await chromium.launch();
  const { base, ctx } = await signedIn(b);
  const p = await ctx.newPage();
  const errors = [];
  const problems = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const check = (ok, what) => {
    console.log(`${ok ? "ok   " : "FALHA"} ${what}`);
    if (!ok) problems.push(what);
  };
  const game = async () => JSON.parse(await p.locator("main[data-game]").getAttribute("data-game"));
  /** Waits until it is the player's turn, or the game is over, up to 20 s. */
  const myTurn = async () => {
    for (let i = 0; i < 100; i++) {
      const g = await game();
      if (g.phase === "over" || g.phase === "failed") return g;
      if (g.phase === "playing" && g.legal.length) return g;
      await p.waitForTimeout(200);
    }
    return game();
  };
  const tap = async (sq) => {
    await p.locator(`[data-square="${sq}"]`).first().tap();
    await p.waitForTimeout(80);
  };
  const playOne = async (g, mv) => {
    const move = mv ?? g.legal.find((m) => m.length === 4) ?? g.legal[0];
    await tap(move.slice(0, 2));
    await tap(move.slice(2, 4));
    return myTurn();
  };
  const rating = async () => Number(await p.locator("[data-game-rating]").getAttribute("data-game-rating"));
  const waitFor = async (text) => p.getByText(text).first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const card = p.locator("section[aria-label='Partida contra o computador']");

  await p.goto(base, { waitUntil: "networkidle" });
  check((await card.textContent()).includes("Rating 800?"), "the home card starts at 800, provisional");
  await p.screenshot({ path: `${OUT}/game-home.png` });
  await card.getByRole("button", { name: "Jogar" }).click();
  await p.screenshot({ path: `${OUT}/game-setup.png` });

  /* ---------- a rated game with white: reload, then abandon ---------- */
  await p.locator('[data-level="400"]').click();
  await p.locator('[data-side="w"]').click();
  await p.getByRole("button", { name: /^Começar/ }).click();
  let g = await myTurn();
  check(g.phase === "playing" && g.player === "w", "the engine loads and white moves first");
  let replies = 0;
  for (let i = 0; i < 3 && g.phase === "playing"; i++) {
    g = await playOne(g);
    if (g.phase === "playing" && g.turn === "w") replies++;
  }
  check(replies > 0, `the computer answers (${replies} replies)`);
  check((await p.locator("ol[aria-label='Lances da partida'] button").count()) >= 3, "the moves are listed under the board");
  await p.screenshot({ path: `${OUT}/game-playing.png` });

  if (g.phase === "playing") {
    const before = g.moves;
    await p.waitForTimeout(500); // the last move's save is on its way
    await p.reload({ waitUntil: "networkidle" });
    g = await myTurn();
    check(g.phase === "playing" && g.moves === before, `a reload keeps the screen and the game (${before} -> ${g.moves} moves)`);
    await p.getByRole("button", { name: "Abandonar" }).click();
    await p.getByRole("dialog").getByRole("button", { name: "Abandonar" }).click();
    check(await waitFor("Derrota"), "abandoning shows the loss");
    check((await rating()) < 800, `abandoning costs rating (800 -> ${await rating()})`);
  } else {
    console.log("the game ended on its own before the reload:", g.phase);
  }
  await p.screenshot({ path: `${OUT}/game-over.png` });
  const afterLoss = await rating();

  /* ---------- black: the computer opens, leaving keeps the game, one move is called off ---------- */
  await p.getByRole("button", { name: "Nova partida" }).click();
  await p.locator('[data-side="b"]').click();
  await p.getByRole("button", { name: /^Começar/ }).click();
  g = await myTurn();
  check(g.phase === "playing" && g.player === "b" && g.turn === "b", "with black, the computer plays the first move");
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Voltar ao início" }).click();
  await p.waitForTimeout(300);
  check((await card.getByRole("button", { name: "Continuar" }).count()) === 1, "leaving keeps the game, and the card offers to continue it");
  await card.getByRole("button", { name: "Continuar" }).click();
  g = await myTurn();
  check(g.phase === "playing" && g.player === "b" && g.moves === 1, "the card brings the same game back");
  await p.getByRole("button", { name: "Abandonar" }).click();
  await p.locator("[data-level]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  check((await p.getByRole("dialog").count()) === 0 && (await p.locator("[data-level]").count()) > 0, "abandoning before both sides moved asks nothing and is not rated");

  /* ---------- assisted: the best move is shown, and the game is not rated ---------- */
  await p.locator('[data-side="w"]').click();
  await p.locator("#game-assisted").click();
  await p.getByRole("button", { name: /^Começar/ }).click();
  g = await myTurn();
  for (let i = 0; i < 50 && !g.hint; i++) {
    await p.waitForTimeout(200);
    g = await game();
  }
  check(Boolean(g.hint) && g.assisted, `the assisted game shows the best move (${g.hint})`);
  check((await p.getByText(/^Melhor lance:/).count()) > 0, "and names it under the board");
  await p.screenshot({ path: `${OUT}/game-assisted.png` });
  g = await playOne(g, g.hint);
  if (g.phase === "playing") g = await playOne(g);
  await p.getByRole("button", { name: "Abandonar" }).click();
  check(await waitFor(/Partida assistida não vale rating/), "abandoning an assisted game says it was not rated");
  check((await rating()) === afterLoss, `the assisted game did not change the rating (${afterLoss} -> ${await rating()})`);

  /* ---------- the history, and a game replayed ---------- */
  await p.getByRole("button", { name: "Partidas anteriores" }).click();
  await p.getByRole("dialog").getByText(/contra o computador/).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const rows = await p.getByRole("dialog").locator("li").allTextContents();
  check(rows.length === 2, `the history lists the two finished games (${rows.length}: ${rows.map((r) => r.replace(/\s+/g, " ")).join(" | ")})`);
  await p.screenshot({ path: `${OUT}/game-history.png` });
  await p.getByRole("dialog").locator("li button").last().click();
  await p.waitForTimeout(300);
  g = await game();
  const total = g.ply;
  check(g.phase === "review" && total > 0, `a game opens for review at its last move (${total})`);
  await p.getByRole("button", { name: "Início da partida" }).click();
  check((await game()).ply === 0, "the review goes back to the initial position");
  await p.getByRole("button", { name: "Próximo lance" }).click();
  check((await game()).ply === 1, "and steps forward one move");
  await p.screenshot({ path: `${OUT}/game-review.png` });
  await p.getByRole("button", { name: "Fechar" }).click();

  await p.getByRole("button", { name: "Voltar ao início" }).click();
  await p.waitForTimeout(300);
  const after = await card.textContent();
  check(/· 1 partida(?!s)/.test(after), `the home card counts one rated game (${after.replace(/\s+/g, " ")})`);
  await p.reload({ waitUntil: "networkidle" });
  check(/· 1 partida(?!s)/.test(await card.textContent()), "the game count survives a reload");

  check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
  console.log(`problems: ${problems.length ? problems.join(" ; ") : "none"}`);
  await b.close();
  process.exit(problems.length ? 1 : 0);
})();
