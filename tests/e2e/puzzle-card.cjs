const { chromium } = require("playwright");
(async () => {
  const { SKELETON } = require("./env.cjs");
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await p.goto("file://" + SKELETON);
  await p.evaluate(() => {
    localStorage.setItem("lance-a-lance:progress:v1", JSON.stringify({ version: 1, xp: 50, lessons: {}, streak: { current: 0, best: 0, lastDay: null }, history: [], updatedAt: Date.now(), puzzles: { rating: 830, played: 7, solved: 6, streak: 0, bestStreak: 2, recent: [] } }));
  });
  await p.reload();
  await p.waitForTimeout(500);
  console.log((await p.locator("section[aria-label='Treino de puzzles']").textContent()).replace(/\s+/g, " "));
  await b.close();
})();
