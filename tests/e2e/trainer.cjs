const { chromium } = require("playwright");
(async () => {
  const { OUT: S, siteUrl } = require("./env.cjs");
  const SITE = await siteUrl();
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(SITE, { waitUntil: "networkidle" });
  await p.waitForTimeout(400);
  // Banner auto-dismiss in lesson 1.1
  await p.getByRole("button", { name: /^Começar/ }).first().click();
  await p.getByRole("button", { name: /^Continuar/ }).click();
  await p.waitForTimeout(300);
  const sol = JSON.parse(await p.locator("main[data-solution]").first().getAttribute("data-solution"));
  const all = "abcdefgh".split("").flatMap((f) => [1,2,3,4,5,6,7,8].map((r) => f + r));
  const wrong = all.find((q) => q[0] !== sol.tap[0][0]);
  await p.locator(`[data-square="${wrong}"]`).first().tap();
  await p.waitForTimeout(300);
  const before = await p.getByText("Ainda não").count();
  await p.waitForTimeout(2800);
  const after = await p.getByText("Ainda não").count();
  console.log("banner shown:", before > 0, "banner auto-closed:", after === 0);
  await p.getByRole("button", { name: "Sair da lição" }).click();
  await p.getByRole("button", { name: "Sair sem salvar" }).click();
  await p.waitForTimeout(300);

  await p.getByRole("button", { name: "Treinar" }).click();
  await p.waitForTimeout(400);
  const tap = async (sq) => { await p.locator(`[data-square="${sq}"]`).first().tap(); await p.waitForTimeout(100); };
  const solve = async () => {
    const s = JSON.parse(await p.locator("main[data-solution]").first().getAttribute("data-solution"));
    for (const mv of s.moves) {
      await tap(mv.from); await tap(mv.to);
      if (mv.promotion) await p.locator(`[data-promotion="${mv.promotion}"]`).click();
      await p.waitForTimeout(900);
    }
  };
  await solve();
  await p.waitForTimeout(2500);
  const hasNext = await p.getByRole("button", { name: "Próximo puzzle" }).count();
  console.log("no auto-advance, done footer shown:", hasNext > 0);
  await p.screenshot({ path: S + "/tr2-done.png" });
  await p.getByRole("button", { name: "Refazer" }).click();
  await p.waitForTimeout(400);
  const practice = await p.getByText(/Refazendo/).count();
  console.log("retry in practice mode:", practice > 0);
  await p.getByRole("button", { name: /Ver solução/ }).click();
  await p.waitForTimeout(6000);
  await p.screenshot({ path: S + "/tr2-solution.png" });
  console.log("after give up:", (await p.getByText(/Solução vista/).count()) > 0);
  await p.getByRole("button", { name: "Próximo puzzle" }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: /Todos os temas/ }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: S + "/tr2-filters.png" });
  await p.getByRole("button", { name: /^Garfo/ }).click();
  await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Puzzles recentes" }).click();
  await p.waitForTimeout(500);
  await p.screenshot({ path: S + "/tr2-history.png" });
  console.log("header:", (await p.locator("header").first().textContent()).replace(/\s+/g, " "));
  console.log("errors", errors.length ? errors : "none");
  await b.close();
})();
