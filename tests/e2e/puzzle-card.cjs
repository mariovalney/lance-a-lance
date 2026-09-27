// The puzzle card on the home, after a few rated attempts.
const { chromium } = require("playwright");
(async () => {
  const { signedIn, puzzleIds, attemptPuzzles } = require("./env.cjs");
  const b = await chromium.launch();
  const { base, ctx } = await signedIn(b);
  const ids = puzzleIds(7);
  await attemptPuzzles(ctx.request, base, ids.map((id, k) => ({ id, status: k === 3 ? "erro" : "ok" })));
  const p = await ctx.newPage();
  await p.goto(base, { waitUntil: "networkidle" });
  console.log((await p.locator("section[aria-label='Treino de puzzles']").textContent()).replace(/\s+/g, " "));
  await b.close();
})();
