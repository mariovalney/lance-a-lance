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
  /** The rating once it moves away from `from`, or `from` after 5 s: the result and the new rating can land in separate renders. */
  const ratingOnceChanged = async (from) => {
    for (let i = 0; i < 25 && (await rating()) === from; i++) await p.waitForTimeout(200);
    return rating();
  };
  const waitFor = async (text) => p.getByText(text).first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
  const card = p.locator("section[aria-label='Partida contra o computador']");
  /** A judged move opens the engine's line in a dialog of its own; the review stays put. */
  const checkLine = async (marks) => {
    const judgedAt = marks.findIndex(Boolean);
    if (judgedAt >= 0) {
      await p.locator("ol[aria-label='Lances da partida'] button").nth(judgedAt).click();
      const reviewPly = (await game()).ply;
      await p.getByRole("button", { name: "Ver lances" }).click();
      const lineStep = async () => Number(await p.locator("[data-line-ply]").getAttribute("data-line-ply"));
      await p.locator("[data-line-ply]").waitFor({ timeout: 5_000 }).catch(() => undefined);
      const lineAttr = (name) => p.locator("[data-line-ply]").getAttribute(name);
      check((await lineStep()) === 0 && (await lineAttr("data-line-arrow")) === "", "the engine's line opens before its move, with no arrow yet");
      check(judgedAt === 0 || /^[a-h][1-8][a-h][1-8]$/.test(await lineAttr("data-line-last")), `and the game's last move marked (${await lineAttr("data-line-last")})`);
      await p.getByRole("button", { name: "Próximo lance da linha" }).click();
      check((await lineStep()) === 1 && /^[a-h][1-8][a-h][1-8]$/.test(await lineAttr("data-line-arrow")), `each step shows its move as an arrow (${await lineAttr("data-line-arrow")})`);
      await p.getByRole("button", { name: "Fim da linha" }).click();
      check((await lineStep()) > 1, `to its end (${await lineStep()})`);
      await p.screenshot({ path: `${OUT}/game-line.png` });
      // The back button closes the dialog and nothing else.
      const reviewAt = p.url();
      await p.goBack({ waitUntil: "commit" }).catch(() => undefined);
      await p.waitForTimeout(400);
      check(
        (await p.locator("[data-line-ply]").count()) === 0 && p.url() === reviewAt && (await game()).ply === reviewPly,
        `the back button closes it and leaves the review on the same move (${new URL(p.url()).pathname})`,
      );
      // Closed with Escape, it leaves no step behind for the back button.
      await p.getByRole("button", { name: "Ver lances" }).click();
      await p.locator("[data-line-ply]").waitFor({ timeout: 5_000 }).catch(() => undefined);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(400);
      check((await p.locator("[data-line-ply]").count()) === 0 && p.url() === reviewAt, "Escape closes it too");
    } else {
      console.log("no judged move in this game: the line dialog is not checked");
    }
  };

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
  const material = async () => p.locator("[data-material]").getAttribute("data-material").catch(() => null);
  check((await material()) === "0", `the material balance starts at 0 (${await material()})`);
  check((await p.getByRole("button", { name: "Partidas anteriores" }).count()) === 0, "the history is not offered during a game");
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
    const lost = await ratingOnceChanged(800);
    check(lost < 800, `abandoning costs rating (800 -> ${lost})`);
    await p.screenshot({ path: `${OUT}/game-over.png` });

    // The end of a game leads to its analysis, which starts on its own.
    await p.getByRole("button", { name: "Ver análise" }).click();
    await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
    for (let i = 0; i < 150 && (await game()).analysis !== "done"; i++) await p.waitForTimeout(200);
    const ended = await game();
    check(new URL(p.url()).pathname === `/partidas/${ended.id}` && ended.analysis === "done", `"Ver análise" opens the game and analyses it (${ended.analysis})`);
    check((await p.getByRole("button", { name: "Partidas anteriores" }).count()) === 0, "the review offers no history either");
    await checkLine(ended.marks);
    await p.goBack({ waitUntil: "networkidle" });
    await p.locator("[data-level]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    check(new URL(p.url()).pathname === "/partida" && (await p.locator("[data-level]").count()) > 0, "back from it is the setup of a new game");
  } else {
    console.log("the game ended on its own before the reload:", g.phase);
  }
  const afterLoss = await rating();

  /* ---------- black: the computer opens, leaving keeps the game, one move is called off ---------- */
  if (await p.getByRole("button", { name: "Nova partida" }).count()) await p.getByRole("button", { name: "Nova partida" }).click();
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
  // Only where a new game is set up.
  await p.getByRole("button", { name: "Nova partida" }).click();
  await p.getByRole("button", { name: "Partidas anteriores" }).click();
  await p.getByRole("dialog").getByText(/contra o computador/).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const rows = await p.getByRole("dialog").locator("li").allTextContents();
  check(rows.length === 2, `the history lists the two finished games (${rows.length}: ${rows.map((r) => r.replace(/\s+/g, " ")).join(" | ")})`);
  await p.screenshot({ path: `${OUT}/game-history.png` });
  // The newest: the assisted game, not analysed yet.
  await p.getByRole("dialog").locator("li button").first().click();
  await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
  g = await game();
  const total = g.ply;
  check(g.phase === "review" && total > 0, `a game opens for review at its last move (${total})`);
  const reviewPath = new URL(p.url()).pathname;
  check(reviewPath === `/partidas/${g.id}`, `at its own address (${reviewPath})`);
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const reloaded = await game();
  check(reloaded.phase === "review" && reloaded.id === g.id && reloaded.ply === total, "a reload stays on the same game");
  await p.getByRole("button", { name: "Início da partida" }).click();
  check((await game()).ply === 0 && (await material()) === "0", "the review goes back to the initial position, material even");
  await p.getByRole("button", { name: "Próximo lance" }).click();
  check((await game()).ply === 1, "and steps forward one move");
  await p.screenshot({ path: `${OUT}/game-review.png` });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await p.getByRole("button", { name: "Copiar PGN" }).click();
  check(await waitFor("Copiado"), "the game is copied");
  const pgn = await p.evaluate(() => navigator.clipboard.readText());
  check(/\[Result "(1-0|0-1|1\/2-1\/2)"\]/.test(pgn) && /\n1\. \S+/.test(pgn) && /\[Site "Lance a Lance"\]/.test(pgn), `as PGN (${pgn.split("\n").slice(0, 2).join(" ")})`);

  /* ---------- the analysis: every move judged, kept with the game ---------- */
  await p.getByRole("button", { name: "Analisar" }).click();
  for (let i = 0; i < 150 && (await game()).analysis === "running"; i++) await p.waitForTimeout(200);
  g = await game();
  check(g.analysis === "done" && g.marks.length === g.moves, `the analysis runs to the end (${g.analysis}, ${g.marks.filter(Boolean).join(" ") || "no marks"})`);
  const stored = await (await p.request.get(`${base}/api/games/${g.id}`)).json();
  check(stored.game?.analysis?.length === g.moves + 1, `and is saved with the game (${stored.game?.analysis?.length} positions)`);
  await p.screenshot({ path: `${OUT}/game-analysis.png` });

  await p.reload({ waitUntil: "networkidle" });
  await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
  check((await game()).analysis === "done" && (await p.getByRole("button", { name: "Analisar" }).count()) === 0, "a reload keeps it, and nothing is left to analyse");
  await p.getByRole("button", { name: "Copiar PGN" }).click();
  const analysed = await p.evaluate(() => navigator.clipboard.readText());
  const judged = g.marks.filter(Boolean).length;
  check(judged === 0 || /\$[246] \{ [^}]*Melhor era [^}]+\}/.test(analysed), `the PGN carries the judgements (${judged} judged)`);

  await p.getByRole("button", { name: "Fechar" }).click();
  await p.waitForTimeout(300);
  check(new URL(p.url()).pathname === "/partida", `closing the review goes back to the game (${new URL(p.url()).pathname})`);

  // Somebody else's game, or no game at all, is not found, and says so.
  await p.goto(`${base}/partidas/00000000-0000-4000-8000-000000000000`, { waitUntil: "networkidle" });
  check(await waitFor("Partida não encontrada."), "an unknown game is not found");
  await p.getByRole("button", { name: "Voltar", exact: true }).click();
  await p.waitForTimeout(300);

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
