// Checks in-lesson auto-advance after each correct answer (touch taps, no extra touches).
const { chromium } = require("playwright");
(async () => {
  const { OUT: S, SKELETON } = require("./env.cjs");
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  await p.goto("file://" + SKELETON);
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: /Valor das peças/ }).first().click();
  await p.waitForTimeout(200);
  await p.getByRole("button", { name: new RegExp(process.env.LESSON || "Trocas boas") }).first().click();
  await p.waitForTimeout(400);
  const tap = async (sq) => { await p.locator(`[data-square="${sq}"]`).first().tap(); await p.waitForTimeout(90); };
  for (let i = 0; i < 30; i++) {
    if (await p.getByText("Para revisar").count()) { console.log("result screen"); break; }
    const sol = await p.locator("main[data-solution]").first().getAttribute("data-solution", { timeout: 1500 }).catch(() => null);
    if (!sol) { await p.waitForTimeout(300); continue; }
    const s = JSON.parse(sol);
    const prog = await p.locator("header [role=progressbar]").getAttribute("aria-valuenow");
    if (s.continue) { await p.getByRole("button", { name: /^Continuar/ }).first().tap(); await p.waitForTimeout(300); continue; }
    if (s.choose) await p.locator(`[data-option-id="${s.choose}"]`).tap();
    else if (s.moves) for (const mv of s.moves) { await tap(mv.from); await tap(mv.to); await p.waitForTimeout(700); }
    else if (s.tap) for (const q of s.tap) await tap(q);
    await p.waitForTimeout(400);
    const btn = (await p.getByRole("button", { name: /^Continuar/ }).first().textContent().catch(() => "")) || "";
    await p.waitForTimeout(1800);
    const prog2 = await p.locator("header [role=progressbar]").getAttribute("aria-valuenow").catch(() => "?");
    console.log(Object.keys(s)[0], "| button:", JSON.stringify(btn), "| advanced:", prog !== prog2 || (await p.getByText("Para revisar").count()) > 0);
    if (prog === prog2 && !(await p.getByText("Para revisar").count())) {
      await p.screenshot({ path: S + "/auto-stuck.png" });
      await p.getByRole("button", { name: /^Continuar/ }).first().tap().catch(() => {});
      await p.waitForTimeout(300);
    }
  }
  await b.close();
})();
