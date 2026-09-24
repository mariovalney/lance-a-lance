// Walks through lessons using the data-solution hints.
// Env: URL, OUT, SCHEME, DONE (comma list of lesson ids to mark completed), MAX_LESSONS, SHOTS (1 = screenshots per kind)
const { chromium } = require("playwright");
const fs = require("fs");
const { Chess } = require("chess.js");

function load(fen) { return new Chess(fen, { skipValidation: true }); }
function mateIn1(fen) {
  const g = load(fen);
  for (const m of g.moves({ verbose: true })) { g.move(m); const ok = g.isCheckmate(); g.undo(); if (ok) return m; }
  return null;
}
function mateIn2(fen) {
  const g = load(fen);
  for (const m of g.moves({ verbose: true })) {
    g.move(m);
    if (g.isCheckmate()) { g.undo(); return m; }
    const replies = g.moves({ verbose: true });
    let all = replies.length > 0 && !g.isDraw();
    for (const r of replies) { if (!all) break; g.move(r); if (!mateIn1(g.fen())) all = false; g.undo(); }
    g.undo();
    if (all) return m;
  }
  return null;
}

const env = require("./env.cjs");
const OUT = process.env.OUT || require("path").join(env.OUT, "walkthrough");
const SCHEME = process.env.SCHEME || "light";
const DONE = (process.env.DONE || "").split(",").filter(Boolean);
const MAX_LESSONS = Number(process.env.MAX_LESSONS || 99);
const SHOTS = process.env.SHOTS === "1";
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: SCHEME, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("console: " + m.text()));
  await page.addInitScript((done) => {
    window.__FAST_DRILL = true;
    if (done.length) {
      const lessons = {};
      for (const id of done) lessons[id] = { bestStars: 3, bestPct: 100, completions: 1 };
      localStorage.setItem("lance-a-lance:progress:v1", JSON.stringify({ version: 1, xp: 0, lessons, streak: { current: 0, best: 0, lastDay: null }, history: [], updatedAt: 1 }));
    }
  }, DONE);
  await page.goto(process.env.URL || "file://" + env.SKELETON);
  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: `${OUT}/${SCHEME}-home.png` });
  await page.getByRole("button", { name: /^(Começar|Praticar)/ }).first().click();

  const tap = async (sq) => {
    await page.locator(`[data-square="${sq}"]`).first().tap();
    await page.waitForTimeout(90);
  };
  const clickContinue = async () => {
    const c = page.getByRole("button", { name: /^Continuar/ });
    if (await c.count()) await c.first().click();
  };

  let lessonsDone = 0;
  let current = "";
  let shotKinds = new Set();
  let wrongDone = false;
  const summary = [];
  for (let guard = 0; guard < 2000; guard++) {
    await page.waitForTimeout(200);
    if (await page.getByText("Para revisar").count()) {
      const pct = await page.locator("dl dd").nth(1).textContent();
      summary.push(`${current} -> ${pct}`);
      if (SHOTS) await page.screenshot({ path: `${OUT}/${SCHEME}-${current.replace(/[^\w.]/g, "_")}-result.png` });
      lessonsDone++;
      if (lessonsDone >= MAX_LESSONS) break;
      if (!(await page.getByRole("button", { name: /Próxima/ }).count())) break;
      await page.getByRole("button", { name: /Próxima/ }).click();
      await page.waitForTimeout(400);
      continue;
    }
    const header = (await page.locator("header").first().textContent({ timeout: 1000 }).catch(() => "")) || "";
    const m = header.match(/(\d+\.\d+)\s·\s(.+?)\d+ XP/);
    if (m && m[1] !== current.split(" ")[0]) {
      current = `${m[1]} ${m[2]}`;
      shotKinds = new Set();
      wrongDone = false;
    }
    const sol = await page.locator("main[data-solution]").first().getAttribute("data-solution", { timeout: 1000 }).catch(() => null);
    if (!sol) continue;
    const s = JSON.parse(sol);
    const idx = await page.locator("header [role=progressbar]").getAttribute("aria-valuenow", { timeout: 1000 }).catch(() => "x");
    const kind = Object.keys(s)[0];
    if (SHOTS && !shotKinds.has(kind)) {
      shotKinds.add(kind);
      await page.screenshot({ path: `${OUT}/${SCHEME}-${current.split(" ")[0]}-${kind}-${idx}.png` });
    }
    if (s.continue) {
      await clickContinue();
    } else if (s.tap) {
      if (!wrongDone) {
        const all = "abcdefgh".split("").flatMap((f) => [1, 2, 3, 4, 5, 6, 7, 8].map((r) => f + r));
        const wrong = all.find((q) => !s.tap.includes(q) && !s.avoid?.includes(q));
        await tap(wrong);
        wrongDone = true;
        await page.waitForTimeout(150);
      }
      for (const sq of s.tap) await tap(sq);
      await page.waitForTimeout(150);
      await clickContinue();
    } else if (s.choose) {
      await page.locator(`[data-option-id="${s.choose}"]`).click();
      await page.waitForTimeout(150);
      if (SHOTS && !shotKinds.has("choose-answered")) {
        shotKinds.add("choose-answered");
        await page.screenshot({ path: `${OUT}/${SCHEME}-${current.split(" ")[0]}-choose-answered.png` });
      }
      await clickContinue();
    } else if (s.drill) {
      await page.getByRole("button", { name: "Começar", exact: true }).click();
      for (let k = 0; k < 80; k++) {
        const t = await page.locator("[data-drill-target]").first().getAttribute("data-drill-target").catch(() => null);
        if (!t) break;
        await tap(t);
      }
      await page.waitForTimeout(3200);
      await clickContinue();
    } else if (s.moves) {
      // [{from,to}] user moves in order; opponent replies are automatic
      for (const mv of s.moves) {
        await tap(mv.from);
        await tap(mv.to);
        if (mv.promotion) await page.locator(`[data-promotion="${mv.promotion}"]`).click();
        await page.waitForTimeout(900);
      }
      await page.waitForTimeout(300);
      await clickContinue();
    } else if (s.play) {
      let solved = false;
      for (let k = 0; k < 4; k++) {
        const cur = JSON.parse(await page.locator("main[data-solution]").first().getAttribute("data-solution"));
        const mv = mateIn1(cur.fen) || mateIn2(cur.fen);
        if (!mv) break;
        await tap(mv.from);
        await tap(mv.to);
        await page.waitForTimeout(1100);
        if (await page.getByText("Xeque-mate!").count()) { solved = true; break; }
      }
      if (solved) {
        if (SHOTS && !shotKinds.has("play-won")) { shotKinds.add("play-won"); await page.screenshot({ path: `${OUT}/${SCHEME}-${current.split(" ")[0]}-play-won.png` }); }
        await page.waitForTimeout(200);
        const c = page.getByRole("button", { name: /^Continuar/ });
        if (await c.count()) await c.first().click();
      } else {
        await page.getByRole("button", { name: "Pular este exercício" }).first().click();
      }
    } else if (s.skip) {
      await page.getByRole("button", { name: "Pular este exercício" }).first().click();
    } else {
      console.log("unknown solution", sol);
      break;
    }
  }
  console.log(summary.join("\n"));
  console.log("errors:", errors.length ? errors.slice(0, 10).join("\n") : "none");
  await browser.close();
})();
