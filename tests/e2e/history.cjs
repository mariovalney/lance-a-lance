const { chromium } = require("playwright");
(async () => {
  const { OUT: S, signedIn, puzzleIds, attemptPuzzles } = require("./env.cjs");
  const b = await chromium.launch();
  const { base, ctx } = await signedIn(b);
  // 25 past attempts, through the trainer's own endpoint.
  const statuses = ["ok", "erro", "solucao"];
  await attemptPuzzles(ctx.request, base, puzzleIds(25).map((id, k) => ({ id, status: statuses[k % 3] })));
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base, { waitUntil: "networkidle" });
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Treinar" }).click();
  await p.waitForTimeout(400);
  console.log("header:", (await p.locator("header").first().textContent()).replace(/\s+/g, " "));
  // Picking a legal-but-wrong move here is awkward, so log one puzzle as seen
  // instead: "Ver solução" also writes a history entry.
  await p.getByRole("button", { name: /Ver solução/ }).click();
  await p.waitForTimeout(6000);
  console.log("header after:", (await p.locator("header").first().textContent()).replace(/\s+/g, " "));
  await p.getByRole("button", { name: "Puzzles recentes" }).click();
  await p.waitForTimeout(700);
  const rows = await p.locator("[role=dialog] li").allTextContents();
  console.log("page1 rows:", rows.length, "| first:", rows[0].replace(/\s+/g, " "));
  console.log("pager:", (await p.getByText(/Página/).textContent()).replace(/\s+/g, " "));
  await p.screenshot({ path: S + "/hist-p1.png" });
  await p.getByRole("button", { name: /Mais antigos/ }).click();
  await p.waitForTimeout(500);
  const rows2 = await p.locator("[role=dialog] li").allTextContents();
  console.log("page2 rows:", rows2.length, "| last:", rows2[rows2.length - 1].replace(/\s+/g, " "));
  console.log("pager:", (await p.getByText(/Página/).textContent()).replace(/\s+/g, " "));
  await p.screenshot({ path: S + "/hist-p2.png" });
  console.log("errors", errors.length ? errors : "none");
  await b.close();
})();
