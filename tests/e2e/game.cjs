// A game against the computer, on the real engine: the card on the home opens
// it, the engine answers, abandoning a rated game costs rating, a game with
// only one move is not rated, and the result survives a reload.
const { chromium } = require("playwright");
(async () => {
  const { OUT, siteUrl } = require("./env.cjs");
  const SITE = await siteUrl();
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  const errors = [];
  const problems = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const check = (ok, what) => {
    console.log(`${ok ? "ok   " : "FALHA"} ${what}`);
    if (!ok) problems.push(what);
  };
  const game = async () => JSON.parse(await p.locator("main[data-game]").getAttribute("data-game"));
  /** Waits until it is the player's turn (or the game is over), up to 20 s. */
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

  await p.goto(SITE, { waitUntil: "networkidle" });
  const card = p.locator("section[aria-label='Partida contra o computador']");
  check((await card.textContent()).includes("Rating 800?"), "the home card starts at 800, provisional");
  await p.screenshot({ path: `${OUT}/game-home.png` });
  await card.getByRole("button", { name: "Jogar" }).click();
  await p.screenshot({ path: `${OUT}/game-setup.png` });

  /* ---------- a rated game with white, abandoned ---------- */
  await p.locator('[data-level="400"]').click();
  await p.locator('[data-side="w"]').click();
  await p.getByRole("button", { name: /^Começar/ }).click();
  let g = await myTurn();
  check(g.phase === "playing" && g.player === "w", "the engine loads and white moves first");
  let replies = 0;
  for (let i = 0; i < 4 && g.phase === "playing"; i++) {
    const mv = g.legal.find((m) => m.length === 4) ?? g.legal[0];
    await tap(mv.slice(0, 2));
    await tap(mv.slice(2, 4));
    g = await myTurn();
    if (g.phase === "playing" && g.turn === "w") replies++;
  }
  check(replies > 0, `the computer answers (${replies} replies)`);
  await p.screenshot({ path: `${OUT}/game-playing.png` });
  if (g.phase === "playing") {
    await p.getByRole("button", { name: "Abandonar" }).click();
    await p.getByRole("dialog").getByRole("button", { name: "Abandonar" }).click();
    await p.waitForTimeout(300);
    check((await p.getByText("Derrota").count()) > 0, "abandoning shows the loss");
    const now = Number(await p.locator("[data-game-rating]").getAttribute("data-game-rating"));
    check(now < 800, `abandoning costs rating (800 -> ${now})`);
  } else {
    console.log("the game ended on its own before abandoning:", g.phase);
  }
  await p.screenshot({ path: `${OUT}/game-over.png` });

  /* ---------- black: the computer opens, and one move is not rated ---------- */
  await p.getByRole("button", { name: "Nova partida" }).click();
  await p.locator('[data-side="b"]').click();
  await p.getByRole("button", { name: /^Começar/ }).click();
  g = await myTurn();
  check(g.phase === "playing" && g.player === "b" && g.turn === "b", "with black, the computer plays the first move");
  await p.getByRole("button", { name: "Voltar ao início" }).click();
  await p.waitForTimeout(300);
  check((await p.getByRole("dialog").count()) === 0, "leaving before both sides moved asks nothing");
  const after = await card.textContent();
  check(/· 1 partida(?!s)/.test(after), `the home card counts one game (${after.replace(/\s+/g, " ")})`);

  await p.reload({ waitUntil: "networkidle" });
  check(/· 1 partida(?!s)/.test(await card.textContent()), "the game count survives a reload");

  check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
  console.log(`problems: ${problems.length ? problems.join(" ; ") : "none"}`);
  await b.close();
  process.exit(problems.length ? 1 : 0);
})();
