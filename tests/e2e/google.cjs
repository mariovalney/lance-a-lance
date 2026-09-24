// Drives signing in with Google, against a running server and the fake Google
// in tests/e2e/google-sink.cjs.
//
//   node tests/e2e/google-sink.cjs 2626 &
//   DATABASE_URL=... PORT=3111 COOKIE_SECURE=false \
//     APP_URL=http://127.0.0.1:3111 GOOGLE_CLIENT_ID=test-client-id \
//     GOOGLE_CLIENT_SECRET=test-client-secret \
//     GOOGLE_AUTH_URL=http://127.0.0.1:2626/authorize \
//     GOOGLE_TOKEN_URL=http://127.0.0.1:2626/token \
//     GOOGLE_USERINFO_URL=http://127.0.0.1:2626/userinfo \
//     node server/dist/index.js &
//
//   URL=http://127.0.0.1:3111 GOOGLE=http://127.0.0.1:2626 pnpm e2e:google
//
// Signing up is closed, so the addresses here are liberated by the admin
// first, which is what production does. With DATABASE_URL set the script also
// starts a second server of its own, without GOOGLE_CLIENT_ID, to prove the
// feature turns itself off.
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");
const { OUT, ROOT } = require("./env.cjs");
const { ADMIN_EMAIL, PASSWORD: ADMIN_PASSWORD, addUser, ensureAdmin } = require("./accounts.cjs");

const BASE = process.env.URL ?? "http://127.0.0.1:3111";
const FAKE = process.env.GOOGLE ?? "http://127.0.0.1:2626";
const STAMP = Date.now();
const XP = 240;

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok   " : "FALHA"} ${label}`);
  if (!ok) problems.push(label);
};

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

function progressFor(xp) {
  return {
    version: 1,
    xp,
    lessons: { "m1-l1": { bestStars: 3, bestPct: 96, completions: 1 } },
    streak: { current: 0, best: 0, lastDay: null },
    history: [],
    records: {},
    puzzles: { rating: 800, played: 0, solved: 0, streak: 0, bestStreak: 0, recent: [] },
    updatedAt: Date.now(),
  };
}

async function open(browser) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  return page;
}

/** Who the fake Google hands over on the next authorization. */
async function nextIdentity(page, identity) {
  const response = await page.request.put(FAKE + "/_identity", { data: identity });
  if (!response.ok()) throw new Error(`the fake Google refused the identity: ${response.status()}`);
}

/** Clicks the button and waits for the round trip through Google to land. */
async function signInWithGoogle(page) {
  await page.getByRole("link", { name: "Entrar com Google" }).click();
  await page.waitForTimeout(2500);
}

async function xpOnScreen(page) {
  const text = await page.locator("header").first().textContent();
  return Number(/(\d+)\s*XP/.exec(text)?.[1] ?? -1);
}

async function accountOnScreen(page) {
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.waitForTimeout(400);
  const email = await page.locator("main, body").getByText(/@exemplo\.com/).first().textContent();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return email?.trim() ?? "";
}

/** A server of our own with no GOOGLE_CLIENT_ID, to see the feature off. */
function serverWithoutGoogle(port) {
  const child = spawn("node", [path.join(ROOT, "server/dist/index.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      COOKIE_SECURE: "false",
      APP_URL: `http://127.0.0.1:${port}`,
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      GOOGLE_AUTH_URL: "",
      GOOGLE_TOKEN_URL: "",
      GOOGLE_USERINFO_URL: "",
    },
    stdio: "ignore",
  });
  return child;
}

const waitForHealth = async (base) => {
  for (let i = 0; i < 30; i++) {
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

(async () => {
  const browser = await chromium.launch();

  /* ---------- the button is there ---------- */
  const first = await open(browser);
  check(await first.getByRole("link", { name: "Entrar com Google" }).isVisible(), "the sign in screen offers Google");
  await first.screenshot({ path: OUT + "/google-signin.png" });

  /* ---------- an address the admin liberated, entering with Google -------- */
  const admin = await browser.newContext(phone);
  await ensureAdmin(admin.request, BASE);
  const fresh = `google-${STAMP}@exemplo.com`;
  await addUser(admin.request, BASE, fresh);

  await nextIdentity(first, { sub: `sub-${STAMP}-a`, email: fresh, email_verified: true });
  await signInWithGoogle(first);
  check((await xpOnScreen(first)) === 0, `Google opens the address the admin liberated (${await xpOnScreen(first)} XP)`);
  check((await accountOnScreen(first)) === fresh, "the account carries the address Google gave");
  await first.screenshot({ path: OUT + "/google-signed-in.png" });

  // Something to recognise the account by on the way back.
  await first.request.put(BASE + "/api/progress", { data: progressFor(XP) });

  /* ---------- the same identity lands on the same account ---------- */
  const again = await open(browser);
  await nextIdentity(again, { sub: `sub-${STAMP}-a`, email: fresh, email_verified: true });
  await signInWithGoogle(again);
  check((await xpOnScreen(again)) === XP, `the same Google identity comes back to the same account (${await xpOnScreen(again)} XP)`);

  /* ---------- a verified email links to the account with a password ------- */
  // The admin's own account is the one with both a password and progress, so
  // it is what proves that linking keeps everything where it was.
  await admin.request.put(BASE + "/api/progress", { data: progressFor(XP) });

  const linking = await open(browser);
  await nextIdentity(linking, { sub: `sub-${STAMP}-b`, email: ADMIN_EMAIL, email_verified: true });
  await signInWithGoogle(linking);
  check((await accountOnScreen(linking)) === ADMIN_EMAIL, "Google lands on the account that already had the address");
  check((await xpOnScreen(linking)) === XP, `and the progress of that account is intact (${await xpOnScreen(linking)} XP)`);

  // Not a second account: the address appears once in the list, and the
  // password still opens the same one.
  const listed = await (await linking.request.get(BASE + "/api/admin/users")).json();
  const rows = (listed.users ?? []).filter((u) => u.email === ADMIN_EMAIL);
  check(rows.length === 1, `the address is on one account only (${rows.length})`);
  check(rows[0]?.providers?.includes("google") === true, "and that account now has both ways in");

  const byPassword = await open(browser);
  await byPassword.getByPlaceholder("E-mail").fill(ADMIN_EMAIL);
  await byPassword.getByPlaceholder("Senha").fill(ADMIN_PASSWORD);
  await byPassword.getByRole("button", { name: "Entrar", exact: true }).click();
  await byPassword.waitForTimeout(2000);
  check((await xpOnScreen(byPassword)) === XP, "the password still opens that one account, so nothing was duplicated");

  /* ---------- an address nobody liberated is refused ---------- */
  const stranger = await open(browser);
  const unknown = `desconhecido-${STAMP}@exemplo.com`;
  await nextIdentity(stranger, { sub: `sub-${STAMP}-d`, email: unknown, email_verified: true });
  await signInWithGoogle(stranger);
  check(await stranger.getByText("As inscrições estão fechadas").isVisible(), "an address the admin never liberated is refused");
  check((await stranger.locator("header").count()) === 0, "and nobody is signed in");

  /* ---------- an unverified email is refused ---------- */
  const unverified = await open(browser);
  const claimed = `naoverificado-${STAMP}@exemplo.com`;
  await addUser(admin.request, BASE, claimed);
  await nextIdentity(unverified, { sub: `sub-${STAMP}-c`, email: claimed, email_verified: false });
  await signInWithGoogle(unverified);
  check(await unverified.getByText("O Google não confirmou esse e-mail").isVisible(), "an unverified email is refused, in Portuguese");
  check((await unverified.locator("header").count()) === 0, "and nobody is signed in");
  await unverified.screenshot({ path: OUT + "/google-unverified.png" });

  // The address was liberated, so the account exists, but it stays untouched:
  // no identity was attached to it.
  const after = await (await admin.request.get(BASE + "/api/admin/users")).json();
  const target = (after.users ?? []).find((u) => u.email === claimed);
  check(target?.providers?.length === 0, "and the account it claimed was left without it");

  /* ---------- a state that does not match is refused ---------- */
  const forged = await open(browser);
  await forged.goto(BASE + "/api/auth/google/callback?code=whatever&state=not-the-one", { waitUntil: "networkidle" });
  await forged.waitForTimeout(800);
  check(await forged.getByText("A entrada pelo Google demorou demais").isVisible(), "a state that does not match is refused");
  check((await forged.locator("header").count()) === 0, "and nobody is signed in");

  await forged.goto(BASE + "/api/auth/google/callback?code=whatever", { waitUntil: "networkidle" });
  await forged.waitForTimeout(800);
  check(await forged.getByText("A entrada pelo Google demorou demais").isVisible(), "a missing state is refused the same way");

  /* ---------- without GOOGLE_CLIENT_ID the whole thing is off ---------- */
  if (process.env.DATABASE_URL) {
    const port = 3117;
    const child = serverWithoutGoogle(port);
    const up = await waitForHealth(`http://127.0.0.1:${port}`);
    check(up, "a server with no GOOGLE_CLIENT_ID starts");
    if (up) {
      const off = await browser.newContext(phone);
      const page = await off.newPage();
      const config = await (await page.request.get(`http://127.0.0.1:${port}/api/auth/config`)).json();
      check(config.googleEnabled === false, "it says Google is off");
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
      await page.waitForTimeout(900);
      check((await page.getByRole("link", { name: "Entrar com Google" }).count()) === 0, "and the button is not on the screen");
      check(await page.getByPlaceholder("E-mail").isVisible(), "while the email form is still there");
      await off.close();
    }
    child.kill();
  } else {
    console.log("skip  the off switch: set DATABASE_URL to check it");
  }

  await browser.close();
  console.log("problems:", problems.length ? problems.join(" ; ") : "none");
  process.exitCode = problems.length ? 1 : 0;
})();
