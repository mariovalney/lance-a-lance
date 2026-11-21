// The demonstrations on the explain screens: a step's moves are played on the
// board, its area (the king's box) is drawn once they are, the arrows walk the
// steps and the last one starts over.
//
//   URL=http://127.0.0.1:3111 pnpm e2e:demo
const { chromium } = require("playwright");
(async () => {
  const { OUT, signedIn } = require("./env.cjs");
  const b = await chromium.launch();
  const { base, ctx } = await signedIn(b);
  const p = await ctx.newPage();
  const errors = [];
  const problems = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const check = (ok, what) => {
    console.log(`${ok ? "ok   " : "FALHA"} ${what}`);
    if (!ok) problems.push(what);
  };
  const step = async () => Number(await p.locator("[data-demo-step]").getAttribute("data-demo-step"));
  const played = async () => p.locator("[data-demo-done]").waitFor({ timeout: 15_000 }).then(() => true, () => false);

  // 5.5: the rook cuts, the king comes, the check pushes, the mate.
  await p.goto(`${base}/licoes/m5-l5`, { waitUntil: "networkidle" });
  check((await step()) === 0 && (await played()), "the first step plays its move");
  check((await p.locator("[data-area]").count()) === 14, `and draws the king's box once it is on the board (${await p.locator("[data-area]").count()} squares)`);
  await p.getByRole("button", { name: "Próximo passo" }).click();
  check((await p.locator("[data-area]").count()) === 0, "the next step hides the box while its moves are played");
  check((await step()) === 1 && (await played()) && (await p.locator("[data-area]").count()) > 0, "and draws it again after them");
  await p.getByRole("button", { name: "Próximo passo" }).click();
  await p.getByRole("button", { name: "Próximo passo" }).click();
  check((await step()) === 3 && (await played()), "the last step plays the mate");
  await p.screenshot({ path: `${OUT}/demo-mate.png` });
  check((await p.getByRole("button", { name: "Próximo passo" }).count()) === 0, "with no step after it");
  await p.getByRole("button", { name: "Ver de novo" }).click();
  check((await step()) === 0, "and starts over from the first");
  await p.getByRole("button", { name: "Próximo passo" }).click();
  await p.getByRole("button", { name: "Passo anterior" }).click();
  check((await step()) === 0 && (await played()), "going back plays the step again");

  // The lesson goes on as before.
  await p.getByRole("button", { name: /^Continuar/ }).click();
  await p.locator("[data-demo-step]").waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
  check((await p.locator("[data-demo-step]").count()) === 0, "Continuar leaves the explanation");

  check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
  console.log(`problems: ${problems.length ? problems.join(" ; ") : "none"}`);
  await b.close();
  process.exit(problems.length ? 1 : 0);
})();
