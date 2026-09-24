// Checks that the artifact build behaves like an artifact.
//
//   pnpm e2e:prepare && pnpm e2e:artifact
//
// The same source now also builds a PWA with accounts, so the risk is the
// account interface leaking into the version published on claude.ai, where
// there is no API and the runtime supplies its own database and viewer id.
// Runs against the skeleton page, with a stub of window.claude.
const { chromium } = require("playwright");
const { OUT, SKELETON } = require("./env.cjs");

const problems = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok   " : "FALHA"} ${label}`);
  if (!ok) problems.push(label);
};

/** Stands in for the claude.ai runtime: an in-memory document store. */
function stubRuntime() {
  const docs = new Map();
  window.claude = {
    use: (name) =>
      Promise.resolve(
        name === "db"
          ? {
              doc: (path) => ({
                get: () => Promise.resolve({ id: path, exists: docs.has(path), data: () => docs.get(path) }),
                set: (data) => {
                  docs.set(path, data);
                  return Promise.resolve();
                },
              }),
            }
          : name === "user"
            ? { id: () => Promise.resolve("viewer-1") }
            : null,
      ),
  };
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();

  const calls = [];
  page.on("request", (r) => /\/api\//.test(r.url()) && calls.push(r.url()));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.addInitScript(stubRuntime);
  await page.goto("file://" + SKELETON);
  await page.waitForTimeout(1200);

  check(errors.length === 0, `sem erros de página${errors.length ? ": " + errors.join(" ; ") : ""}`);
  check(calls.length === 0, `não chama nenhuma API${calls.length ? ": " + calls.join(" ; ") : ""}`);

  const badge = await page.locator("header").first().textContent();
  check(/Na nuvem|Salvando/.test(badge), `usa o banco do Artifact (selo: ${/Na nuvem|Salvando|Neste aparelho|Conectando/.exec(badge)?.[0]})`);

  await page.getByRole("button", { name: "Ajustes" }).click();
  await page.waitForTimeout(500);
  check((await page.getByText("Sem entrar, o progresso fica").count()) === 0, "não oferece entrar");
  check((await page.getByText("Conta", { exact: true }).count()) === 0, "não mostra seção de conta");
  // The backup is the migration path out of the artifact, so it must be here.
  check(await page.getByRole("button", { name: "Exportar" }).isVisible(), "oferece exportar o progresso");
  check(await page.getByRole("button", { name: "Importar" }).isVisible(), "oferece importar o progresso");
  await page.screenshot({ path: OUT + "/artifact-settings.png" });

  await browser.close();
  console.log("problems:", problems.length ? problems.join(" ; ") : "none");
  process.exitCode = problems.length ? 1 : 0;
})();
