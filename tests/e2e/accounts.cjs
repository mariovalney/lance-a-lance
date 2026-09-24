// What the account tests need in common, now that signing up is closed: the
// first account claims the deploy and is the admin, and every other account is
// created by it, by address, through /api/admin/users.
//
// A person created that way has no password. They get in with Google, or by
// asking for one on the sign in screen, which is what `resetLinkFor` reads out
// of the throwaway mail sink.
const fs = require("node:fs");

/** The account every script bootstraps, so they can run in any order. */
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@exemplo.com";
const PASSWORD = process.env.PASSWORD ?? "a-good-password";

/**
 * Becomes the admin: signs up when the database is empty, signs in when the
 * account is already there. Returns a request context carrying the session.
 */
async function ensureAdmin(request, base) {
  const created = await request.post(`${base}/api/auth/signup`, { data: { email: ADMIN_EMAIL, password: PASSWORD } });
  if (created.ok()) return { email: ADMIN_EMAIL, fresh: true };
  const signedIn = await request.post(`${base}/api/auth/login`, { data: { email: ADMIN_EMAIL, password: PASSWORD } });
  if (!signedIn.ok()) {
    throw new Error(`could not become the admin: signup ${created.status()}, login ${signedIn.status()}`);
  }
  return { email: ADMIN_EMAIL, fresh: false };
}

/** Liberates an address, the way the admin page does. */
async function addUser(request, base, email) {
  const response = await request.post(`${base}/api/admin/users`, { data: { email } });
  if (!response.ok()) throw new Error(`could not add ${email}: ${response.status()} ${await response.text()}`);
}

/**
 * Undoes quoted-printable, which is how the accented Portuguese gets encoded.
 * It also wraps long lines, which splits the reset URL in two, so this has to
 * run before looking for the link.
 */
const decodeQuotedPrintable = (text) =>
  text.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

/** The newest reset link in the sink, for one address. */
function resetLinkFor(sinkPath, email, since) {
  if (!fs.existsSync(sinkPath)) return null;
  const messages = JSON.parse(fs.readFileSync(sinkPath, "utf8")).filter((m) => m.at > since && m.to.includes(email));
  for (const message of messages.reverse()) {
    const match = /https?:\/\/\S*\/redefinir\?token=[\w-]+/.exec(decodeQuotedPrintable(message.body));
    if (match) return match[0];
  }
  return null;
}

/** Waits for the message to land: the server sends it after answering. */
async function waitForResetLink(sinkPath, email, since, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const link = resetLinkFor(sinkPath, email, since);
    if (link) return link;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/**
 * Takes an address the admin liberated all the way to a working password, the
 * way a person does it: ask on the sign in screen, open the link, choose one.
 * Signs the page out first, since that is where the sign in screen is.
 */
async function givePassword(page, base, sinkPath, email, password) {
  const since = new Date(Date.now() - 1000).toISOString();
  // This is somebody else arriving, so whoever was signed in here goes first:
  // otherwise the app opens instead of the sign in screen.
  await page.context().clearCookies();
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("E-mail").fill(email);
  await page.getByRole("button", { name: "Esqueci a senha" }).click();
  const link = await waitForResetLink(sinkPath, email, since);
  if (!link) throw new Error(`no reset link arrived for ${email}`);
  await page.goto(link, { waitUntil: "networkidle" });
  await page.getByLabel("Senha nova").fill(password);
  await page.getByLabel("Repita a senha").fill(password);
  await page.getByRole("button", { name: "Trocar a senha" }).click();
  await page.waitForTimeout(1200);
}

module.exports = { ADMIN_EMAIL, PASSWORD, ensureAdmin, addUser, resetLinkFor, waitForResetLink, givePassword, decodeQuotedPrintable };
