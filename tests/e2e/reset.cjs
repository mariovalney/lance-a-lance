// Drives the password reset the way a person does it: ask from the settings,
// open the link that arrived, choose a new password, sign in with it.
//
// Needs two things already running, because the server reads its SMTP settings
// at boot and the mail has to land somewhere readable:
//
//   node tests/e2e/smtp-sink.cjs 2526 /tmp/sink.json
//   DATABASE_URL=... APP_URL=http://127.0.0.1:3444 SMTP_HOST=127.0.0.1 \
//     SMTP_PORT=2526 SMTP_FROM=nao-responda@exemplo.com PORT=3444 \
//     COOKIE_SECURE=false pnpm start
//
//   URL=http://127.0.0.1:3444 SINK=/tmp/sink.json pnpm e2e:reset
const fs = require("node:fs");
const { chromium } = require("playwright");
const { OUT } = require("./env.cjs");

const BASE = process.env.URL ?? "http://127.0.0.1:3444";
const SINK = process.env.SINK ?? "/tmp/sink.json";
const ACCOUNT = process.env.EMAIL ?? `reset-${Date.now()}@exemplo.com`;
const OLD_PASSWORD = "senhaantiga1";
const NEW_PASSWORD = "senhanovaboa1";

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok   " : "FALHA"} ${label}`);
  if (!ok) problems.push(label);
};

const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

/**
 * Undoes quoted-printable, which is how the accented Portuguese gets encoded.
 * It also wraps long lines, which splits the reset URL in two, so this has to
 * run before looking for the link. Bytes above 127 come out as latin1, which is
 * fine here: only the URL is read, and a URL is ASCII.
 */
const decodeQuotedPrintable = (text) =>
  text.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

/** The reset link out of the newest message in the sink. */
function linkFromMailbox(since) {
  const messages = JSON.parse(fs.readFileSync(SINK, "utf8")).filter((m) => m.at > since);
  for (const message of messages.reverse()) {
    const match = /https?:\/\/\S*\/redefinir\?token=[\w-]+/.exec(decodeQuotedPrintable(message.body));
    if (match) return { link: match[0], to: message.to };
  }
  return null;
}

async function openSettings(page) {
  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.waitForTimeout(400);
}

(async () => {
  if (!fs.existsSync(SINK)) throw new Error(`no mailbox at ${SINK}: start tests/e2e/smtp-sink.cjs first`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // An account to lose the password of. Signup may be closed by now, so this
  // goes through the API rather than the interface.
  const created = await page.request.post(BASE + "/api/auth/signup", { data: { email: ACCOUNT, password: OLD_PASSWORD } });
  if (!created.ok()) throw new Error(`could not create the test account: ${created.status()} ${await created.text()}`);
  await ctx.clearCookies();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  /* ---------- ask for the link ---------- */
  const before = new Date().toISOString();
  await openSettings(page);
  check(await page.getByRole("button", { name: "Esqueci a senha" }).isVisible(), "oferece esqueci a senha quando o servidor manda e-mail");

  await page.getByRole("button", { name: "Esqueci a senha" }).click();
  await page.waitForTimeout(600);
  check(await page.getByText("Escreva seu e-mail acima primeiro.").isVisible(), "pede o e-mail antes de mandar");

  await page.getByPlaceholder("E-mail").fill(ACCOUNT);
  await page.getByRole("button", { name: "Esqueci a senha" }).click();
  await page.waitForTimeout(1500);
  check(await page.getByText(/link para escolher uma senha nova/).isVisible(), "confirma que o link foi enviado");
  await page.screenshot({ path: OUT + "/reset-requested.png" });

  const mail = linkFromMailbox(before);
  check(Boolean(mail), "o e-mail chegou na caixa");
  if (!mail) {
    await browser.close();
    console.log("problems:", problems.join(" ; "));
    process.exitCode = 1;
    return;
  }
  check(mail.to.includes(ACCOUNT), `endereçado para a conta (${mail.to.join(", ")})`);
  check(mail.link.startsWith(BASE + "/redefinir?token="), `o link aponta para o APP_URL (${mail.link.slice(0, 40)}...)`);

  /* ---------- open the link ---------- */
  const reader = await (await browser.newContext(phone)).newPage();
  await reader.goto(mail.link, { waitUntil: "networkidle" });
  await reader.waitForTimeout(800);
  check(await reader.getByText("Nova senha").isVisible(), "o link abre a tela de nova senha");
  await reader.screenshot({ path: OUT + "/reset-screen.png" });

  await reader.getByLabel("Senha nova").fill(NEW_PASSWORD);
  await reader.getByLabel("Repita a senha").fill("outracoisa1");
  await reader.getByRole("button", { name: "Trocar a senha" }).click();
  await reader.waitForTimeout(600);
  check(await reader.getByText("As duas senhas não são iguais.").isVisible(), "recusa quando as duas senhas diferem");

  await reader.getByLabel("Repita a senha").fill(NEW_PASSWORD);
  await reader.getByRole("button", { name: "Trocar a senha" }).click();
  await reader.waitForTimeout(1500);
  check(await reader.getByText(/Senha trocada/).isVisible(), "confirma a troca");
  await reader.screenshot({ path: OUT + "/reset-done.png" });

  await reader.getByRole("button", { name: "Ir para o início" }).click();
  await reader.waitForTimeout(800);
  check(new URL(reader.url()).pathname === "/", "tira o token da barra de endereço");

  /* ---------- the new password is the one that works ---------- */
  const old = await reader.request.post(BASE + "/api/auth/login", { data: { email: ACCOUNT, password: OLD_PASSWORD } });
  check(old.status() === 401, `a senha antiga não entra mais (${old.status()})`);
  const fresh = await reader.request.post(BASE + "/api/auth/login", { data: { email: ACCOUNT, password: NEW_PASSWORD } });
  check(fresh.ok(), `a senha nova entra (${fresh.status()})`);

  // And the link is spent.
  const again = await reader.request.post(BASE + "/api/auth/reset", { data: { token: new URL(mail.link).searchParams.get("token"), password: "maisumasenha1" } });
  check(again.status() === 400, `o link não serve duas vezes (${again.status()})`);

  await browser.close();
  console.log("problems:", problems.length ? problems.join(" ; ") : "none");
  process.exitCode = problems.length ? 1 : 0;
})();
