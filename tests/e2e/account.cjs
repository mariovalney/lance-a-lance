// Drives the account and backup flows against a running server.
//
//   URL=http://127.0.0.1:3111 pnpm e2e:account
//
// Needs a server that still accepts signups: a database with no users yet, or
// SIGNUP_ENABLED=true. The app is behind the sign in screen, so every browser
// here starts by getting in, and behind an account the browser keeps no copy
// of the progress at all. Signs up with a copy already sitting in the browser
// and checks the account ignores it, seeds the account through the API, checks
// it shows and that nothing was written here, signs in from a second browser,
// then exports the backup and imports it into a second account.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { OUT } = require("./env.cjs");

const BASE = process.env.URL ?? "http://127.0.0.1:3111";
const STAMP = Date.now();
const EMAIL = process.env.EMAIL ?? `teste-${STAMP}@exemplo.com`;
const OTHER = `teste-${STAMP}-b@exemplo.com`;
const PASSWORD = "a-good-password";
const XP = 240;
// What a browser that played before there were accounts still holds. It is not
// the account's, so it must never show up and never go up.
const STALE = 77;

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok   " : "FALHA"} ${label}`);
  if (!ok) problems.push(label);
};

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true };

/** Stands in for having played lessons and solved puzzles. */
function progressFor(xp) {
  return {
    version: 1,
    xp,
    lessons: { "m1-l1": { bestStars: 3, bestPct: 96, completions: 1 }, "m1-l2": { bestStars: 2, bestPct: 80, completions: 1 } },
    streak: { current: 0, best: 0, lastDay: null },
    history: [],
    records: { "coords-30s": 21 },
    puzzles: { rating: 861, played: 3, solved: 2, streak: 1, bestStreak: 2, recent: ["aaa"] },
    updatedAt: Date.now(),
  };
}

const PUZZLE_LOG = [
  { i: "aaa", s: "ok", d: 20, r: 820, p: 800, t: Date.now() - 3000 },
  { i: "bbb", s: "erro", d: -9, r: 811, p: 900, t: Date.now() - 2000 },
  { i: "ccc", s: "ok", d: 50, r: 861, p: 1000, t: Date.now() - 1000 },
];

/** Writes an old copy straight into the browser, the way this used to work. */
function seedBrowser(state) {
  localStorage.setItem("lance-a-lance:progress:v1", JSON.stringify(state));
}

/** Fills the account the way the app would, through the API. */
async function seedAccount(page, state) {
  await page.request.put(BASE + "/api/progress", { data: state });
  await page.request.put(BASE + "/api/puzzlelog/0", { data: { entries: PUZZLE_LOG } });
}

const browserCopy = (page) => page.evaluate(() => localStorage.getItem("lance-a-lance:progress:v1"));

async function open(browser, { withProgress = false } = {}) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  if (withProgress) {
    await page.evaluate(seedBrowser, progressFor(STALE));
    await page.reload({ waitUntil: "networkidle" });
  }
  await page.waitForTimeout(900);
  return page;
}

/** The sign in screen is the whole app until somebody is in. */
async function getIn(page, email, { create = false } = {}) {
  if (create) await page.getByRole("button", { name: "Ainda não tenho conta" }).click();
  await page.getByPlaceholder("E-mail").fill(email);
  await page.getByPlaceholder("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: create ? "Criar conta" : "Entrar", exact: true }).click();
  await page.waitForTimeout(2000);
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
  check(await first.getByText("Entre para o seu progresso").isVisible(), "with no account, the first screen asks to sign in");
  check((await first.locator("header").count()) === 0, "with no account, the app is not behind the sign in screen");
  await first.screenshot({ path: OUT + "/signin.png" });

  await getIn(first, EMAIL, { create: true });
  check((await xpOnScreen(first)) === 0, `the account ignores the copy sitting in the browser (${await xpOnScreen(first)} XP)`);
  const empty = await (await first.request.get(BASE + "/api/progress")).json();
  check((empty.state?.xp ?? 0) === 0, `and nothing from it went up (${empty.state?.xp ?? 0} XP)`);

  /* ---------- the account is the only copy ---------- */
  await seedAccount(first, progressFor(XP));
  await first.reload({ waitUntil: "networkidle" });
  await first.waitForTimeout(1200);
  check((await xpOnScreen(first)) === XP, `the account progress is what shows (${await xpOnScreen(first)} XP)`);
  check(JSON.parse(await browserCopy(first))?.xp === STALE, "and the browser was not written to");
  await first.screenshot({ path: OUT + "/account-signed-in.png" });

  await openSettings(first);
  check(await first.getByText(EMAIL).isVisible(), "the settings show the account that is in");
  await first.screenshot({ path: OUT + "/settings-signed-in.png" });
  await closeSettings(first);

  /* ---------- second browser: clean, signs in ---------- */
  const second = await open(browser);
  await getIn(second, EMAIL);
  check((await xpOnScreen(second)) === XP, `the fresh browser got the account progress (${await xpOnScreen(second)} XP)`);
  check((await browserCopy(second)) === null, "and kept no copy of it");

  /* ---------- export ---------- */
  await openSettings(first);
  const [download] = await Promise.all([first.waitForEvent("download"), first.getByRole("button", { name: "Exportar" }).click()]);
  const file = path.join(OUT, "backup.json");
  await download.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  check(backup.app === "lance-a-lance" && backup.kind === "backup", "the exported file carries the app marker");
  check(backup.progress?.xp === XP, `the exported file carries the XP (${backup.progress?.xp})`);
  check(backup.puzzleLog?.["0"]?.filter(Boolean).length === 3, "the exported file carries the puzzle history");

  /* ---------- signing out goes back to the sign in screen, and empties it --- */
  await first.getByRole("button", { name: "Sair" }).click();
  await first.waitForTimeout(1500);
  check(await first.getByText("Entre para o seu progresso").isVisible(), "signing out lands back on the sign in screen");
  check((await browserCopy(first)) === null, "signing out clears even the old copy the browser held");

  /* ---------- another account on the same browser starts from its own ------- */
  // The session is gone but the browser is the same, which is what a closed tab
  // or a cleared cookie looks like.
  await second.context().clearCookies();
  await second.reload({ waitUntil: "networkidle" });
  await second.waitForTimeout(900);
  await getIn(second, OTHER, { create: true });
  check((await xpOnScreen(second)) === 0, "another account on the same browser starts empty");
  const untouched = await (await second.request.get(BASE + "/api/progress")).json();
  check((untouched.state?.xp ?? 0) === 0, `and nothing was pushed into it (${untouched.state?.xp ?? 0} XP)`);

  /* ---------- import into that second, empty account ---------- */
  const third = await open(browser);
  await getIn(third, OTHER);
  check((await xpOnScreen(third)) === 0, "a fresh account starts empty");
  await openSettings(third);
  await third.locator('input[type="file"]').setInputFiles(file);
  await third.waitForTimeout(1500);
  check(await third.getByText(/^Importado:/).isVisible(), "confirms the import");
  await closeSettings(third);
  check((await xpOnScreen(third)) === XP, `the imported progress showed up (${await xpOnScreen(third)} XP)`);

  /* ---------- with the server out of reach there is nothing to show -------- */
  // Progress is the account's, so the app says so instead of opening empty.
  await third.route("**/api/**", (route) => route.abort());
  await third.reload({ waitUntil: "domcontentloaded" });
  await third.waitForTimeout(1500);
  check(await third.getByText("Sem conexão").isVisible(), "an unreachable server shows the offline screen");
  check((await third.locator("header").count()) === 0, "and never the course without the progress");
  await third.screenshot({ path: OUT + "/account-offline.png" });
  await third.unroute("**/api/**");
  await third.reload({ waitUntil: "networkidle" });
  await third.waitForTimeout(1200);
  check((await xpOnScreen(third)) === XP, "and comes back when the server does");

  /* ---------- a wrong password is refused ---------- */
  const fourth = await open(browser);
  await fourth.getByPlaceholder("E-mail").fill(EMAIL);
  await fourth.getByPlaceholder("Senha").fill("wrong-password");
  await fourth.getByRole("button", { name: "Entrar", exact: true }).click();
  await fourth.waitForTimeout(1500);
  check(await fourth.getByText("E-mail ou senha não conferem.").isVisible(), "refuses a wrong password with a readable message");
  await fourth.screenshot({ path: OUT + "/account-wrong-password.png" });

  await browser.close();
  console.log("problems:", problems.length ? problems.join(" ; ") : "none");
  process.exitCode = problems.length ? 1 : 0;
})();
