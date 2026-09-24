// Drives the admin page and the addresses the app answers, against a running
// server and the throwaway mail sink.
//
//   URL=http://127.0.0.1:3111 SINK=/tmp/sink.json pnpm e2e:admin
//
// The first account claims the deploy and is the admin. Everyone else is
// liberated by address here, and gets a password through the link. Without
// SINK the parts that need a second person to sign in are skipped.
const { chromium } = require("playwright");
const { OUT } = require("./env.cjs");
const { ADMIN_EMAIL, PASSWORD, addUser, givePassword } = require("./accounts.cjs");

const BASE = process.env.URL ?? "http://127.0.0.1:3111";
const SINK = process.env.SINK ?? "";
const STAMP = Date.now();
const GUEST = `convidado-${STAMP}@exemplo.com`;
const TYPED = `digitado-${STAMP}@exemplo.com`;

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok   " : "FALHA"} ${label}`);
  if (!ok) problems.push(label);
};

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function open(browser) {
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  return page;
}

async function signIn(page, email, password) {
  const creating = await page.getByRole("button", { name: "Ainda não tenho conta" }).count();
  if (creating) await page.getByRole("button", { name: "Ainda não tenho conta" }).click();
  await page.getByPlaceholder("E-mail").fill(email);
  await page.getByPlaceholder("Senha").fill(password);
  await page.getByRole("button", { name: creating ? "Criar conta" : "Entrar", exact: true }).click();
  await page.waitForTimeout(2000);
}

const rowFor = (page, email) => page.locator(`[data-user="${email}"]`);

(async () => {
  const browser = await chromium.launch();

  /* ---------- the first account is the admin ---------- */
  const admin = await open(browser);
  await signIn(admin, ADMIN_EMAIL, PASSWORD);
  const me = await (await admin.request.get(BASE + "/api/auth/me")).json();
  check(me.user?.isAdmin === true, "the first account is the admin");

  /* ---------- the page is offered and opens ---------- */
  await admin.getByRole("button", { name: "Ajustes" }).click();
  await admin.waitForTimeout(400);
  check(await admin.getByRole("link", { name: "Contas" }).isVisible(), "the settings offer the accounts page");
  await admin.getByRole("link", { name: "Contas" }).click();
  await admin.waitForTimeout(1500);
  check(new URL(admin.url()).pathname === "/admin", "it opens at /admin");
  check(await rowFor(admin, ADMIN_EMAIL).isVisible(), "and lists the admin itself");
  await admin.screenshot({ path: OUT + "/admin.png" });

  /* ---------- liberating an address from the page ---------- */
  await admin.getByPlaceholder("E-mail").fill(TYPED);
  await admin.getByRole("button", { name: "Liberar" }).click();
  await admin.waitForTimeout(1500);
  check(await rowFor(admin, TYPED).isVisible(), "an address typed here shows up in the list");
  check(await admin.getByText(/Conta criada para/).isVisible(), "and the page says what happens next");

  // Twice is refused, rather than making a second account for one address.
  await admin.getByPlaceholder("E-mail").fill(TYPED);
  await admin.getByRole("button", { name: "Liberar" }).click();
  await admin.waitForTimeout(1200);
  check(await admin.getByText("Já existe uma conta com esse e-mail.").isVisible(), "the same address twice is refused");

  /* ---------- the admin cannot remove itself ---------- */
  const selfRow = rowFor(admin, ADMIN_EMAIL);
  check(await selfRow.getByRole("button", { name: /administração|administrador/ }).isDisabled(), "the admin cannot demote itself");
  check(await selfRow.getByRole("button", { name: /Apagar a conta/ }).isDisabled(), "nor delete itself");
  const refused = await admin.request.post(`${BASE}/api/admin/users/${me.user.id}/admin`, { data: { isAdmin: false } });
  check(refused.status() === 400, `and the API refuses it too (${refused.status()})`);

  /* ---------- somebody who is not the admin ---------- */
  if (SINK) {
    await addUser(admin.request, BASE, GUEST);
    const guest = await open(browser);
    await givePassword(guest, BASE, SINK, GUEST, PASSWORD);
    await guest.goto(BASE + "/", { waitUntil: "networkidle" });
    await signIn(guest, GUEST, PASSWORD);
    check((await guest.locator("header").count()) > 0, "the liberated address gets into the app");

    await guest.getByRole("button", { name: "Ajustes" }).click();
    await guest.waitForTimeout(400);
    check((await guest.getByRole("link", { name: "Contas" }).count()) === 0, "and is not offered the accounts page");
    await guest.keyboard.press("Escape");

    const forbidden = await guest.request.get(BASE + "/api/admin/users");
    check(forbidden.status() === 403, `the API refuses them (${forbidden.status()})`);

    await guest.goto(BASE + "/admin", { waitUntil: "networkidle" });
    await guest.waitForTimeout(1200);
    check((await guest.getByPlaceholder("E-mail").count()) === 0, "and /admin does not show them the page");
    check(new URL(guest.url()).pathname === "/", "it drops them on the home instead");

    /* ---------- promoting, then taking it back ---------- */
    await admin.reload({ waitUntil: "networkidle" });
    await admin.waitForTimeout(1200);
    await rowFor(admin, GUEST).getByRole("button", { name: /administrador/ }).click();
    await admin.waitForTimeout(1500);
    check(await rowFor(admin, GUEST).getByText("admin").isVisible(), "the admin can promote somebody");
    await rowFor(admin, GUEST).getByRole("button", { name: /administração/ }).click();
    await admin.waitForTimeout(1500);
    check((await rowFor(admin, GUEST).getByText("admin").count()) === 0, "and take it back");

    /* ---------- and delete the account ---------- */
    await rowFor(admin, GUEST).getByRole("button", { name: /Apagar a conta/ }).click();
    await admin.waitForTimeout(500);
    await admin.getByRole("button", { name: "Apagar", exact: true }).click();
    await admin.waitForTimeout(1500);
    check((await rowFor(admin, GUEST).count()) === 0, "deleting takes the account off the list");
    const gone = await admin.request.post(BASE + "/api/auth/login", { data: { email: GUEST, password: PASSWORD } });
    check(gone.status() === 401, `and the password stops working (${gone.status()})`);
  } else {
    console.log("skip  the guest, promotion and deletion: set SINK to check them");
  }

  /* ---------- only the addresses the app answers ---------- */
  const visitor = await browser.newContext(phone);
  const page = await visitor.newPage();
  for (const [path, expected] of [
    ["/", 200],
    ["/redefinir", 200],
    ["/admin", 200],
  ]) {
    const response = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    check(response.status() === expected, `${path} answers ${response.status()}`);
  }
  for (const path of ["/dsdsdsds", "/admin/tudo", "/asaaaaaaaaa"]) {
    const response = await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    check(response.status() === 404, `${path} answers ${response.status()}, not the app`);
  }
  check(await page.getByText("Página não encontrada").isVisible(), "and says so in Portuguese, with a way back");
  await page.screenshot({ path: OUT + "/not-found.png" });

  await browser.close();
  console.log("problems:", problems.length ? problems.join(" ; ") : "none");
  process.exitCode = problems.length ? 1 : 0;
})();
