const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const { OUT: S, SKELETON } = require("./env.cjs");
  const ids = JSON.parse(fs.readFileSync(require("path").join(__dirname, "../../src/content/data/trainer.json"), "utf8")).puzzles.slice(0, 30).map((p) => p.i);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("file://" + SKELETON);
  await p.waitForTimeout(500);
  // Seed 25 past attempts.
  await p.evaluate((ids) => {
    const key = "lance-a-lance:progress:v1";
    const st = JSON.parse(localStorage.getItem(key) || "null") || { version: 1, xp: 0, lessons: {}, streak: { current: 0, best: 0, lastDay: null }, history: [] };
    st.puzzles = { rating: 850, played: 25, solved: 18, streak: 0, bestStreak: 4, recent: [] };
    st.updatedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(st));
    const s = ["ok", "erro", "solucao"];
    const log = Array.from({ length: 25 }, (_, k) => ({ i: ids[k], s: s[k % 3], d: k % 3 ? -8 : 9, r: 800 + k, p: 900 + k * 10, t: Date.now() - (25 - k) * 60000 }));
    localStorage.setItem("lance-a-lance:puzzlelog:v1:0", JSON.stringify(log));
  }, ids);
  await p.reload();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Treinar" }).click();
  await p.waitForTimeout(400);
  console.log("header:", (await p.locator("header").first().textContent()).replace(/\s+/g, " "));
  // Play one puzzle wrong then right.
  const s = JSON.parse(await p.locator("main[data-solution]").first().getAttribute("data-solution"));
  const tap = async (sq) => { await p.locator(`[data-square="${sq}"]`).first().tap(); await p.waitForTimeout(120); };
  // wrong move: find a legal different move is hard; use Ver solução after a wrong attempt instead
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
