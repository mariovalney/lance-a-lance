const { chromium } = require("playwright");
(async () => {
  const { OUT: S, SKELETON } = require("./env.cjs");
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("file://" + SKELETON);
  await p.waitForTimeout(500);
  await p.screenshot({ path: S + "/home-unlocked.png" });
  // Open the last module and start its last lesson directly.
  const mod = p.getByRole("button", { name: /Finais/ }).first();
  await mod.click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: S + "/home-m11.png", fullPage: true });
  const rows = p.locator("li button:not([disabled])");
  console.log("enabled lesson rows:", await rows.count(), "| locked text:", await p.getByText(/Conclua a anterior/).count(), "| flame:", await p.locator("[aria-label^='Sequência']").count());
  await p.getByRole("button", { name: /Philidor/ }).first().click();
  await p.waitForTimeout(400);
  console.log("opened lesson:", (await p.locator("main").first().textContent()).slice(0, 80).replace(/\s+/g, " "));
  console.log("errors", errors.length ? errors : "none");
  await b.close();
})();
