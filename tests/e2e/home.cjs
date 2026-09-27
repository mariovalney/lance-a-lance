const { chromium } = require("playwright");
(async () => {
  const { OUT: S, signedIn, postOk } = require("./env.cjs");
  const b = await chromium.launch();
  const { base: SITE, ctx } = await signedIn(b);
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(SITE, { waitUntil: "networkidle" });
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
  const problems = [];
  const check = (ok, what) => {
    console.log(`${ok ? "ok   " : "FALHA"} ${what}`);
    if (!ok) problems.push(what);
  };
  // Every screen has an address, so a reload stays on it.
  const lessonPath = new URL(p.url()).pathname;
  check(/^\/licoes\/m11-l\d+$/.test(lessonPath), `a lesson has its address (${lessonPath})`);
  await p.reload({ waitUntil: "networkidle" });
  check(new URL(p.url()).pathname === lessonPath && (await p.locator("main").count()) > 0, "and a reload starts it again there");
  await p.goBack({ waitUntil: "networkidle" }).catch(() => undefined);
  check(new URL(p.url()).pathname === "/" && (await p.getByRole("button", { name: /Finais/ }).count()) > 0, "the back button goes home");
  await p.goto(SITE + "/treino", { waitUntil: "networkidle" });
  await p.reload({ waitUntil: "networkidle" });
  check(new URL(p.url()).pathname === "/treino" && (await p.locator("main[data-solution]").count()) > 0, "the trainer survives a reload");
  await p.goto(SITE + "/licoes/m99-l9", { waitUntil: "networkidle" });
  check(new URL(p.url()).pathname === "/", "a lesson that does not exist goes home");

  // A lesson played again after it was completed earns half the XP; stars still use the full points.
  const runOf = (points) => postOk(ctx.request, `${SITE}/api/lessons/runs`, { lessonId: "m11-l5", points, maxPoints: 40, mistakes: [], records: [] });
  const first = await runOf(35);
  check(first.run.xp === 35 && !first.run.repeat, `the first run earns its points (${first.run.xp} XP)`);
  const again = await runOf(37);
  check(again.run.xp === 19 && again.run.repeat, `a run of a completed lesson earns half (${again.run.xp} XP)`);
  check(again.run.stars === 3 && again.progress.xp === first.progress.xp + 19, `with the stars of the full points, and the total adds the half (${again.progress.xp} XP)`);
  await p.goto(`${SITE}/licoes/m11-l5`, { waitUntil: "networkidle" });
  check((await p.getByText("Revisão, metade do XP").count()) === 1, "the lesson says so in its header");

  // A lesson completed on content that has changed since shows "Nova versão" and earns full XP once more.
  // The row is restored from a backup without a version, as files written before versions existed.
  const backup = await (await ctx.request.get(`${SITE}/api/backup`)).json();
  backup.data.lessons = backup.data.lessons.filter((l) => l.lessonId !== "m9-l1");
  backup.data.lessons.push({ lessonId: "m9-l1", bestStars: 2, bestPct: 80, completions: 1, lastMistakes: [], firstCompletedAt: null, lastPlayedAt: null });
  await postOk(ctx.request, `${SITE}/api/backup`, backup);
  await p.goto(SITE, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /Aberturas/ }).first().click();
  await p.waitForTimeout(300);
  check((await p.locator("[data-updated]").count()) === 1, "a lesson done on an older version says Nova versão");
  const reworked = (points) => postOk(ctx.request, `${SITE}/api/lessons/runs`, { lessonId: "m9-l1", points, maxPoints: 40, mistakes: [], records: [] });
  const fresh = await reworked(40);
  check(fresh.run.xp === 40 && !fresh.run.repeat, `its first run on the new version earns in full (${fresh.run.xp} XP)`);
  check(fresh.progress.lessons["m9-l1"].bestStars === 3, "and the best stars only go up");
  const review = await reworked(40);
  check(review.run.xp === 20 && review.run.repeat, `after that it is a review again (${review.run.xp} XP)`);
  await p.reload({ waitUntil: "networkidle" });
  await p.getByRole("button", { name: /Aberturas/ }).first().click();
  await p.waitForTimeout(300);
  check((await p.locator("[data-updated]").count()) === 0, "and the tag is gone");

  console.log(`problems: ${problems.length ? problems.join(" ; ") : "none"}`);
  console.log("errors", errors.length ? errors : "none");
  await b.close();
  process.exit(problems.length || errors.length ? 1 : 0);
})();
