// Drives the account and backup flows against a running server.
//
//   URL=http://127.0.0.1:3111 pnpm e2e:account
//
// Expects a server whose database has no users yet, so the first signup is
// allowed. Seeds progress in one browser, signs up, checks the progress
// reached the API, signs in from a second browser and checks it came back,
// then exports the backup and imports it into a third, empty browser.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { OUT } = require("./env.cjs");

const BASE = process.env.URL ?? "http://127.0.0.1:3111";
const EMAIL = process.env.EMAIL ?? `teste-${Date.now()}@exemplo.com`;
const PASSWORD = "umasenhaboa";
const XP = 240;

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok   " : "FALHA"} ${label}`);
  if (!ok) problems.push(label);
};

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true };

/** Stands in for having played lessons and solved puzzles. */
function seed(xp) {
  const state = {
    version: 1,
    xp,
    lessons: { "m1-l1": { bestStars: 3, bestPct: 96, completions: 1 }, "m1-l2": { bestStars: 2, bestPct: 80, completions: 1 } },
    streak: { current: 0, best: 0, lastDay: null },
    history: [],
    records: { "coords-30s": 21 },
    puzzles: { rating: 861, played: 3, solved: 2, streak: 1, bestStreak: 2, recent: ["aaa"] },
    updatedAt: Date.now(),
  };
  localStorage.setItem("lance-a-lance:progress:v1", JSON.stringify(state));
  localStorage.setItem(
    "lance-a-lance:puzzlelog:v1:0",
    JSON.stringify([
      { i: "aaa", s: "ok", d: 20, r: 820, p: 800, t: Date.now() - 3000 },
      { i: "bbb", s: "erro", d: -9, r: 811, p: 900, t: Date.now() - 2000 },
      { i: "ccc", s: "ok", d: 50, r: 861, p: 1000, t: Date.now() - 1000 },
    ]),
  );
}

async function open(browser, { withProgress = false } = {}) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  if (withProgress) {
    await page.evaluate(seed, XP);
    await page.reload({ waitUntil: "networkidle" });
  }
  await page.waitForTimeout(900);
  return page;
}

async function openSettings(page) {
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.waitForTimeout(400);
}

async function closeSettings(page) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
}

async function xpOnScreen(page) {
  const text = await page.locator("header").first().textContent();
  return Number(/(\d+)\s*XP/.exec(text)?.[1] ?? -1);
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- first browser: has progress, creates the account ---------- */
  const first = await open(browser, { withProgress: true });
  check((await xpOnScreen(first)) === XP, `o progresso semeado apareceu (${await xpOnScreen(first)} XP)`);

  await openSettings(first);
  check(await first.getByText("Sem entrar, o progresso fica").isVisible(), "oferece entrar quando ninguém entrou");
  await first.screenshot({ path: OUT + "/settings-anon.png" });
  await first.getByRole("button", { name: "Ainda não tenho conta" }).click();
  await first.getByPlaceholder("E-mail").fill(EMAIL);
  await first.getByPlaceholder("Senha").fill(PASSWORD);
  await first.getByRole("button", { name: "Criar conta", exact: true }).click();
  await first.waitForTimeout(2000);
  check(await first.getByText(EMAIL).isVisible(), "mostra o e-mail depois de criar a conta");
  await first.screenshot({ path: OUT + "/settings-signed-in.png" });

  // The local copy is newer than the empty account, so it gets pushed up.
  const stored = await (await first.request.get(BASE + "/api/progress")).json();
  check(stored.state?.xp === XP, `o servidor recebeu o progresso local (${stored.state?.xp} XP)`);
  check(stored.state?.records?.["coords-30s"] === 21, "os recordes foram junto");

  await closeSettings(first);
  await first.screenshot({ path: OUT + "/account-signed-in.png" });

  /* ---------- second browser: clean, signs in ---------- */
  const second = await open(browser);
  check((await xpOnScreen(second)) === 0, "aparelho novo começa zerado");
  await openSettings(second);
  await second.getByPlaceholder("E-mail").fill(EMAIL);
  await second.getByPlaceholder("Senha").fill(PASSWORD);
  await second.getByRole("button", { name: "Entrar", exact: true }).click();
  await second.waitForTimeout(2000);
  await closeSettings(second);
  check((await xpOnScreen(second)) === XP, `o aparelho novo recebeu o progresso da conta (${await xpOnScreen(second)} XP)`);

  // And the puzzle history came with it.
  const log = await (await second.request.get(BASE + "/api/puzzlelog/0")).json();
  check(Array.isArray(log.entries) && log.entries.filter(Boolean).length === 3, `o histórico de puzzles subiu (${log.entries?.filter(Boolean).length})`);

  /* ---------- export ---------- */
  await openSettings(first);
  const [download] = await Promise.all([first.waitForEvent("download"), first.getByRole("button", { name: "Exportar" }).click()]);
  const file = path.join(OUT, "backup.json");
  await download.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  check(backup.app === "lance-a-lance" && backup.kind === "backup", "o arquivo exportado tem a marca do app");
  check(backup.progress?.xp === XP, `o arquivo exportado traz o XP (${backup.progress?.xp})`);
  check(backup.puzzleLog?.["0"]?.filter(Boolean).length === 3, "o arquivo exportado traz o histórico de puzzles");

  /* ---------- signing out keeps this browser's copy ---------- */
  await first.getByRole("button", { name: "Sair" }).click();
  await first.waitForTimeout(1500);
  check(await first.getByText("Sem entrar, o progresso fica").isVisible(), "voltou a oferecer entrar");
  await closeSettings(first);
  check((await xpOnScreen(first)) === XP, "sair mantém o progresso neste navegador");

  /* ---------- import into a third, empty browser ---------- */
  const third = await open(browser);
  check((await xpOnScreen(third)) === 0, "terceiro navegador começa zerado");
  await openSettings(third);
  await third.locator('input[type="file"]').setInputFiles(file);
  await third.waitForTimeout(1500);
  check(await third.getByText(/^Importado:/).isVisible(), "confirma a importação");
  await closeSettings(third);
  check((await xpOnScreen(third)) === XP, `o progresso importado apareceu (${await xpOnScreen(third)} XP)`);

  /* ---------- a wrong password is refused ---------- */
  const fourth = await open(browser);
  await openSettings(fourth);
  await fourth.getByPlaceholder("E-mail").fill(EMAIL);
  await fourth.getByPlaceholder("Senha").fill("senhaerrada");
  await fourth.getByRole("button", { name: "Entrar", exact: true }).click();
  await fourth.waitForTimeout(1500);
  check(await fourth.getByText("E-mail ou senha não conferem.").isVisible(), "recusa a senha errada com uma mensagem clara");
  await fourth.screenshot({ path: OUT + "/account-wrong-password.png" });

  await browser.close();
  console.log("problems:", problems.length ? problems.join(" ; ") : "none");
  process.exitCode = problems.length ? 1 : 0;
})();
