// A game against the computer, on the real engine and the real server: the card
// on the home opens it, the engine answers, a reload keeps both the screen and
// the game, abandoning a rated game costs rating, a game with one move is
// called off, an assisted game shows the best move and is not rated, the
// history lists the games and replays one, and a study starts from a move of a
// finished game without touching the rating.
//
//   URL=http://127.0.0.1:3111 pnpm e2e:game
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
  const game = async () => JSON.parse(await p.locator("main[data-game]").getAttribute("data-game"));
  /** Waits until it is the player's turn, or the game is over, up to 20 s. */
  const myTurn = async () => {
    for (let i = 0; i < 100; i++) {
      const g = await game();
      if (g.phase === "over" || g.phase === "failed") return g;
      if (g.phase === "playing" && g.legal.length) return g;
      await p.waitForTimeout(200);
    }
    return game();
  };
  const tap = async (sq) => {
    await p.locator(`[data-square="${sq}"]`).first().tap();
    await p.waitForTimeout(80);
  };
  const playOne = async (g, mv) => {
    const move = mv ?? g.legal.find((m) => m.length === 4) ?? g.legal[0];
    await tap(move.slice(0, 2));
    await tap(move.slice(2, 4));
    return myTurn();
  };
  const rating = async () => Number(await p.locator("[data-game-rating]").getAttribute("data-game-rating"));
  /** The rating once it moves away from `from`, or `from` after 5 s: the result and the new rating can land in separate renders. */
  const ratingOnceChanged = async (from) => {
    for (let i = 0; i < 25 && (await rating()) === from; i++) await p.waitForTimeout(200);
    return rating();
  };
  const waitFor = async (text) => p.getByText(text).first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
  /** The review's copy button, an icon, once it says the PGN went to the clipboard; then it is reset for the next copy. */
  const copied = async () => {
    const done = await p.locator("[data-exported='copied']").waitFor({ timeout: 10_000 }).then(() => true, () => false);
    await p.locator("[data-exported]").waitFor({ state: "detached", timeout: 5_000 }).catch(() => undefined);
    return done;
  };
  const card = p.locator("section[aria-label='Partida contra o computador']");
  /** A judged move opens the engine's line in a dialog of its own; the review stays put. */
  const checkLine = async (marks) => {
    const judgedAt = marks.findIndex(Boolean);
    if (judgedAt >= 0) {
      await p.locator("ol[aria-label='Lances da partida'] button").nth(judgedAt).click();
      const reviewPly = (await game()).ply;
      await p.getByRole("button", { name: "Ver lances" }).click();
      const lineStep = async () => Number(await p.locator("[data-line-ply]").getAttribute("data-line-ply"));
      await p.locator("[data-line-ply]").waitFor({ timeout: 5_000 }).catch(() => undefined);
      const lineAttr = (name) => p.locator("[data-line-ply]").getAttribute(name);
      check((await lineStep()) === 0 && (await lineAttr("data-line-arrow")) === "", "the engine's line opens before its move, with no arrow yet");
      check(judgedAt === 0 || /^[a-h][1-8][a-h][1-8]$/.test(await lineAttr("data-line-last")), `and the game's last move marked (${await lineAttr("data-line-last")})`);
      await p.getByRole("button", { name: "Próximo lance da linha" }).click();
      check((await lineStep()) === 1 && /^[a-h][1-8][a-h][1-8]$/.test(await lineAttr("data-line-arrow")), `each step shows its move as an arrow (${await lineAttr("data-line-arrow")})`);
      await p.getByRole("button", { name: "Fim da linha" }).click();
      check((await lineStep()) > 1, `to its end (${await lineStep()})`);
      await p.screenshot({ path: `${OUT}/game-line.png` });
      // The back button closes the dialog and nothing else.
      const reviewAt = p.url();
      await p.goBack({ waitUntil: "commit" }).catch(() => undefined);
      await p.waitForTimeout(400);
      check(
        (await p.locator("[data-line-ply]").count()) === 0 && p.url() === reviewAt && (await game()).ply === reviewPly,
        `the back button closes it and leaves the review on the same move (${new URL(p.url()).pathname})`,
      );
      // Closed with Escape, it leaves no step behind for the back button.
      await p.getByRole("button", { name: "Ver lances" }).click();
      await p.locator("[data-line-ply]").waitFor({ timeout: 5_000 }).catch(() => undefined);
      await p.keyboard.press("Escape");
      await p.waitForTimeout(400);
      check((await p.locator("[data-line-ply]").count()) === 0 && p.url() === reviewAt, "Escape closes it too");
    } else {
      console.log("no judged move in this game: the line dialog is not checked");
    }
  };

  await p.goto(base, { waitUntil: "networkidle" });
  check((await card.textContent()).includes("Rating 800?"), "the home card starts at 800, provisional");
  await p.screenshot({ path: `${OUT}/game-home.png` });
  await card.getByRole("button", { name: "Jogar" }).click();
  await p.screenshot({ path: `${OUT}/game-setup.png` });

  /* ---------- a rated game with white: reload, then abandon ---------- */
  await p.locator('[data-level="400"]').click();
  await p.locator('[data-side="w"]').click();
  await p.getByRole("button", { name: /^Começar/ }).click();
  let g = await myTurn();
  check(g.phase === "playing" && g.player === "w", "the engine loads and white moves first");
  const material = async () => p.locator("[data-material]").getAttribute("data-material").catch(() => null);
  check((await material()) === "0", `the material balance starts at 0 (${await material()})`);
  check((await p.getByRole("button", { name: "Partidas anteriores" }).count()) === 0, "the history is not offered during a game");
  let replies = 0;
  for (let i = 0; i < 3 && g.phase === "playing"; i++) {
    g = await playOne(g);
    if (g.phase === "playing" && g.turn === "w") replies++;
  }
  check(replies > 0, `the computer answers (${replies} replies)`);
  check((await p.locator("ol[aria-label='Lances da partida'] button").count()) >= 3, "the moves are listed under the board");
  await p.screenshot({ path: `${OUT}/game-playing.png` });

  if (g.phase === "playing") {
    const before = g.moves;
    await p.waitForTimeout(500); // the last move's save is on its way
    await p.reload({ waitUntil: "networkidle" });
    g = await myTurn();
    check(g.phase === "playing" && g.moves === before, `a reload keeps the screen and the game (${before} -> ${g.moves} moves)`);
    await p.getByRole("button", { name: "Abandonar" }).click();
    await p.getByRole("dialog").getByRole("button", { name: "Abandonar" }).click();
    check(await waitFor("Derrota"), "abandoning shows the loss");
    const lost = await ratingOnceChanged(800);
    check(lost < 800, `abandoning costs rating (800 -> ${lost})`);
    await p.screenshot({ path: `${OUT}/game-over.png` });

    // The end of a game leads to its analysis, which starts on its own.
    await p.getByRole("button", { name: "Ver análise" }).click();
    await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
    for (let i = 0; i < 150 && (await game()).analysis !== "done"; i++) await p.waitForTimeout(200);
    const ended = await game();
    check(new URL(p.url()).pathname === `/partidas/${ended.id}` && ended.analysis === "done", `"Ver análise" opens the game and analyses it (${ended.analysis})`);
    check((await p.getByRole("button", { name: "Partidas anteriores" }).count()) === 0, "the review offers no history either");
    await checkLine(ended.marks);
    await p.goBack({ waitUntil: "networkidle" });
    await p.locator("[data-level]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    check(new URL(p.url()).pathname === "/partida" && (await p.locator("[data-level]").count()) > 0, "back from it is the setup of a new game");
  } else {
    console.log("the game ended on its own before the reload:", g.phase);
  }
  const afterLoss = await rating();

  /* ---------- black: the computer opens, leaving keeps the game, one move is called off ---------- */
  if (await p.getByRole("button", { name: "Nova partida" }).count()) await p.getByRole("button", { name: "Nova partida" }).click();
  await p.locator('[data-side="b"]').click();
  await p.getByRole("button", { name: /^Começar/ }).click();
  g = await myTurn();
  check(g.phase === "playing" && g.player === "b" && g.turn === "b", "with black, the computer plays the first move");
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Voltar ao início" }).click();
  await p.waitForTimeout(300);
  check((await card.getByRole("button", { name: "Continuar" }).count()) === 1, "leaving keeps the game, and the card offers to continue it");
  await card.getByRole("button", { name: "Continuar" }).click();
  g = await myTurn();
  check(g.phase === "playing" && g.player === "b" && g.moves === 1, "the card brings the same game back");
  await p.getByRole("button", { name: "Abandonar" }).click();
  await p.locator("[data-level]").first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  check((await p.getByRole("dialog").count()) === 0 && (await p.locator("[data-level]").count()) > 0, "abandoning before both sides moved asks nothing and is not rated");

  /* ---------- assisted: the best move is shown, and the game is not rated ---------- */
  await p.locator('[data-side="w"]').click();
  await p.locator("#game-assisted").click();
  await p.getByRole("button", { name: /^Começar/ }).click();
  g = await myTurn();
  for (let i = 0; i < 50 && !g.hint; i++) {
    await p.waitForTimeout(200);
    g = await game();
  }
  check(Boolean(g.hint) && g.assisted, `the assisted game shows the best move (${g.hint})`);
  check((await p.getByText(/^Melhor lance:/).count()) > 0, "and names it under the board");
  await p.screenshot({ path: `${OUT}/game-assisted.png` });
  g = await playOne(g, g.hint);
  if (g.phase === "playing") g = await playOne(g);
  await p.getByRole("button", { name: "Abandonar" }).click();
  check(await waitFor(/Partida assistida não vale rating/), "abandoning an assisted game says it was not rated");
  check((await rating()) === afterLoss, `the assisted game did not change the rating (${afterLoss} -> ${await rating()})`);

  /* ---------- the history, and a game replayed ---------- */
  // Only where a new game is set up.
  await p.getByRole("button", { name: "Nova partida" }).click();
  await p.getByRole("button", { name: "Partidas anteriores" }).click();
  // A page of its own, rated and assisted games apart.
  const listed = async () => {
    const panel = p.locator("[role='tabpanel']");
    await panel.getByText(/contra o computador|Nenhuma/).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    return (await panel.locator("li button").allTextContents()).map((r) => r.replace(/\s+/g, " "));
  };
  check(new URL(p.url()).pathname === "/partidas", `the history is a page (${new URL(p.url()).pathname})`);
  const rated = await listed();
  check(rated.length === 1, `the rated tab lists the rated game (${rated.length}: ${rated.join(" | ")})`);
  await p.screenshot({ path: `${OUT}/game-history.png` });
  await p.getByRole("tab", { name: "Assistidas" }).click();
  const assistedRows = await listed();
  check(assistedRows.length === 1, `the assisted tab lists the assisted game (${assistedRows.length}: ${assistedRows.join(" | ")})`);
  // The assisted game, not analysed yet.
  await p.locator("[role='tabpanel'] li button").first().click();
  await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
  g = await game();
  const total = g.ply;
  check(g.phase === "review" && total > 0, `a game opens for review at its last move (${total})`);
  const reviewPath = new URL(p.url()).pathname;
  check(reviewPath === `/partidas/${g.id}`, `at its own address (${reviewPath})`);
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const reloaded = await game();
  check(reloaded.phase === "review" && reloaded.id === g.id && reloaded.ply === total, "a reload stays on the same game");
  await p.getByRole("button", { name: "Início da partida" }).click();
  check((await game()).ply === 0 && (await material()) === "0", "the review goes back to the initial position, material even");
  await p.getByRole("button", { name: "Próximo lance" }).click();
  check((await game()).ply === 1, "and steps forward one move");
  await p.screenshot({ path: `${OUT}/game-review.png` });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  await p.getByRole("button", { name: "Copiar PGN" }).click();
  check(await copied(), "the game is copied");
  const pgn = await p.evaluate(() => navigator.clipboard.readText());
  check(/\[Result "(1-0|0-1|1\/2-1\/2)"\]/.test(pgn) && /\n1\. \S+/.test(pgn) && /\[Site "Lance a Lance"\]/.test(pgn), `as PGN (${pgn.split("\n").slice(0, 2).join(" ")})`);

  /* ---------- the analysis: every move judged, kept with the game ---------- */
  // Stopped halfway, it keeps what it covered, and continues from there.
  await p.getByRole("button", { name: "Analisar", exact: true }).click();
  const cancel = p.getByRole("button", { name: "Cancelar a análise" });
  for (let i = 0; i < 100 && !/^[2-9]\//.test((await cancel.textContent().catch(() => "")) ?? ""); i++) await p.waitForTimeout(100);
  await cancel.click();
  await p.locator(`main[data-game*='"analysis":"partial"']`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  const halfway = (await (await p.request.get(`${base}/api/games/${g.id}`)).json()).game?.analysis?.length;
  check((await game()).analysis === "partial" && halfway >= 2 && halfway <= g.moves, `stopping the analysis keeps what it covered (${halfway} of ${g.moves + 1} positions)`);
  await p.reload({ waitUntil: "networkidle" });
  await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
  check((await p.getByRole("button", { name: "Continuar análise" }).count()) === 1, "a reload offers to continue it");
  await p.getByRole("button", { name: "Continuar análise" }).click();
  for (let i = 0; i < 150 && (await game()).analysis === "running"; i++) await p.waitForTimeout(200);
  g = await game();
  check(g.analysis === "done" && g.marks.length === g.moves, `the analysis runs to the end (${g.analysis}, ${g.marks.filter(Boolean).join(" ") || "no marks"})`);
  const stored = await (await p.request.get(`${base}/api/games/${g.id}`)).json();
  check(stored.game?.analysis?.length === g.moves + 1, `and is saved with the game (${stored.game?.analysis?.length} positions)`);
  await p.screenshot({ path: `${OUT}/game-analysis.png` });

  await p.reload({ waitUntil: "networkidle" });
  await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
  check((await game()).analysis === "done" && (await p.getByRole("button", { name: "Analisar" }).count()) === 0, "a reload keeps it, and nothing is left to analyse");
  await p.getByRole("button", { name: "Copiar PGN" }).click();
  // The clipboard still holds the copy made before the analysis until this one lands.
  await copied();
  const analysed = await p.evaluate(() => navigator.clipboard.readText());
  const judged = g.marks.filter(Boolean).length;
  check(judged === 0 || /\$[246]\s+\{\s+[^}]*Melhor\s+era\s+[^}]+\}/.test(analysed), `the PGN carries the judgements (${judged} judged: ${analysed.split("\n\n")[1]?.slice(0, 200)})`);

  // An only move (!), on a hand-written analysis: the first move was the
  // engine's best, and the best of the others would have been a blunder.
  {
    const stored = (await (await p.request.get(`${base}/api/games/${g.id}`)).json()).game;
    const other = stored.moves[0] === "g1f3" ? "b1c3" : "g1f3";
    const analysis = stored.moves.map((m, i) => ({ cp: 0, best: m, pv: [m], alt: i === 0 ? { cp: -300, best: other } : null }));
    analysis.push({ cp: 0, best: null });
    const put = await p.request.put(`${base}/api/games/${g.id}/analysis`, { data: { analysis } });
    await p.reload({ waitUntil: "networkidle" });
    await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
    const marked = await game();
    check(put.ok() && marked.analysis === "done" && marked.marks[0] === "!" && marked.marks.slice(1).every((m) => m === null), `an only move is marked "!" (${marked.marks.join(" ")})`);
    await p.getByRole("button", { name: "Início da partida" }).click();
    await p.getByRole("button", { name: "Próximo lance" }).click();
    const said = (await p.locator("p", { hasText: "Lance único." }).first().textContent().catch(() => "")) ?? "";
    check(/^Lance único\. Qualquer outro seria um erro grave\. O melhor deles era N[fc]3 \(cavalo para [fc]3\)\. Ver lances$/.test(said), `with the best of the others named under the board (${said})`);
    await p.screenshot({ path: `${OUT}/game-only-move.png` });
    await p.getByRole("button", { name: "Copiar PGN" }).click();
    await copied();
    const withOnly = await p.evaluate(() => navigator.clipboard.readText());
    check(/\$1\s+\{\s+Lance\s+único\.\s+Qualquer\s+outro\s+seria\s+um\s+erro\s+grave\./.test(withOnly), `and in the PGN as $1 (${withOnly.split("\n\n")[1]?.slice(0, 120)})`);
  }

  await p.getByRole("button", { name: "Fechar" }).click();
  await p.waitForTimeout(300);
  check(new URL(p.url()).pathname === "/partidas", `closing the review goes back to the history (${new URL(p.url()).pathname})`);
  check((await p.getByRole("tab", { name: "Assistidas" }).getAttribute("aria-selected")) === "true", "on the tab it was on");
  await p.getByRole("button", { name: "Voltar para a partida" }).click();
  await p.waitForTimeout(300);
  check(new URL(p.url()).pathname === "/partida", `and from there back to the game (${new URL(p.url()).pathname})`);

  /* ---------- a study: a game from a move of a finished game, never rated ---------- */
  await p.getByRole("button", { name: "Partidas anteriores" }).click();
  await p.getByRole("tab", { name: "Partidas", exact: true }).click();
  await listed();
  await p.locator("[role='tabpanel'] li button").first().click();
  await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
  const source = await game();
  await p.getByRole("button", { name: "Início da partida" }).click();
  check(await p.getByRole("button", { name: "Rejogar" }).isDisabled(), "the initial position offers no study");
  await p.locator("ol[aria-label='Lances da partida'] button").nth(1).click();
  check((await game()).ply === 2, "a move picked in the review");
  await p.getByRole("button", { name: "Rejogar" }).click();
  const studyDialog = p.locator("[data-study-dialog]");
  await studyDialog.waitFor({ timeout: 5_000 }).catch(() => undefined);
  check((await studyDialog.getByText(/^Começa depois de 1\.\.\. .+Partida de estudo, não vale rating\.$/).count()) === 1, `the dialog says where the study starts (${(await studyDialog.textContent())?.slice(0, 120)})`);
  check((await studyDialog.locator("[data-level][aria-pressed='true']").getAttribute("data-level")) === "400", "with the level of the game reviewed");
  await p.waitForTimeout(300); // the dialog's opening animation
  await p.screenshot({ path: `${OUT}/game-study-dialog.png` });
  const ratingBefore = await rating();
  await studyDialog.getByRole("button", { name: "Começar" }).click();
  await p.waitForURL(/\/partida$/, { timeout: 10_000 }).catch(() => undefined);
  g = await myTurn();
  check(
    new URL(p.url()).pathname === "/partida" && g.phase === "playing" && g.study === 2 && g.moves === 2 && g.player === source.player,
    `the study starts after that move, with the same pieces (study ${g.study}, ${g.moves} moves, ${g.player})`,
  );
  check(/estudo/.test(await p.locator("header").textContent()) && (await p.locator("[data-study-start='2']").count()) === 1, "it is marked as a study, its start in the move list");
  g = await playOne(g);
  await p.screenshot({ path: `${OUT}/game-study.png` });
  await p.getByRole("button", { name: "Abandonar" }).click();
  check(await waitFor(/Partida de estudo não vale rating/), "abandoning a study asks nothing and says it was not rated");
  check((await ratingOnceChanged(ratingBefore)) === ratingBefore, "the rating stays");
  const studyId = (await (await p.request.get(`${base}/api/games?page=0&size=1&kind=study`)).json()).items?.[0]?.id;

  await p.getByRole("button", { name: "Nova partida" }).click();
  await p.getByRole("button", { name: "Partidas anteriores" }).click();
  check((await listed()).length === 1, "the study stays out of the rated games");
  await p.getByRole("tab", { name: "Estudos" }).click();
  const studies = await listed();
  check(studies.length === 1 && /Depois de 1\. \.\.|Depois de 1\.\.\. /.test(studies[0]), `the studies tab lists it, with where it began (${studies.join(" | ")})`);
  await p.screenshot({ path: `${OUT}/game-history-studies.png` });
  await p.locator("[role='tabpanel'] li button").first().click();
  await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
  g = await game();
  check(g.id === studyId && g.study === 2 && (await p.locator("[data-study-start='2']").count()) === 1, "its review marks where it began");

  // Its analysis takes the positions it carries from the game it began from.
  await p.getByRole("button", { name: "Analisar" }).click();
  for (let i = 0; i < 150 && (await game()).analysis === "running"; i++) await p.waitForTimeout(200);
  const [studied, original] = await Promise.all([studyId, source.id].map(async (id) => (await (await p.request.get(`${base}/api/games/${id}`)).json()).game));
  check(
    studied.analysis?.length === studied.moves.length + 1 && JSON.stringify(studied.analysis.slice(0, 2)) === JSON.stringify(original.analysis?.slice(0, 2)),
    "its analysis reuses the original game's for the positions it carries",
  );
  await p.getByRole("button", { name: "Copiar PGN" }).click();
  await copied();
  const studyPgn = await p.evaluate(() => navigator.clipboard.readText());
  check(/\[Event "Estudo contra o computador"\]/.test(studyPgn) && /\{ Início do estudo \}/.test(studyPgn), `its PGN marks the start (${studyPgn.split("\n\n")[1]?.slice(0, 80)})`);
  await p.screenshot({ path: `${OUT}/game-study-review.png` });
  await p.getByRole("button", { name: "ver a partida original" }).click();
  await p.locator(`main[data-game*='"id":"${source.id}"']`).waitFor({ timeout: 10_000 }).catch(() => undefined);
  check(new URL(p.url()).pathname === `/partidas/${source.id}`, `and leads to the game it began from (${new URL(p.url()).pathname})`);

  /* ---------- a brilliant move (!!), on a hand-written analysis of Légal's trap ---------- */
  // 4...g6? 5.Nxe5!! Bxd1 6.Bxf7+ Ke7 7.Nd5#: played as an assisted game, so
  // it touches no rating.
  {
    const moves = ["e2e4", "e7e5", "g1f3", "d7d6", "f1c4", "c8g4", "b1c3", "g7g6", "f3e5", "g4d1", "c4f7", "e8e7", "c3d5"];
    const started = (await (await p.request.post(`${base}/api/games`, { data: { level: 400, player: "w", assisted: true } })).json()).game;
    const finished = await p.request.post(`${base}/api/games/${started.id}/finish`, { data: { moves, resigned: false, day: new Date().toISOString().slice(0, 10) } });
    const quiet = (v, best, alt) => ({ cp: v, best, pv: [best], ...(alt ? { alt } : {}) });
    const line = ["f3e5", "g4d1", "c4f7", "e8e7", "c3d5"];
    const analysis = [
      quiet(20, "e2e4", { cp: 15, best: "d2d4" }),
      quiet(30, "e7e5", { cp: 35, best: "c7c5" }),
      quiet(30, "g1f3", { cp: 25, best: "b1c3" }),
      quiet(40, "d7d6", { cp: 45, best: "b8c6" }),
      quiet(40, "f1c4", { cp: 35, best: "d2d4" }),
      quiet(40, "g8f6"),
      quiet(60, "h2h3"),
      quiet(50, "g8f6"),
      { mate: 3, best: "f3e5", pv: line, alt: { cp: 60, best: "h2h3" } },
      { mate: 2, best: "g4d1", pv: line.slice(1), alt: { cp: 150, best: "d6e5" } },
      { mate: 2, best: "c4f7", pv: line.slice(2), alt: { mate: 3, best: "c3d5" } },
      { mate: -1, best: "e8e7", pv: line.slice(3), alt: { mate: -1, best: "e8d7" } },
      { mate: 1, best: "c3d5", pv: line.slice(4), alt: { mate: 2, best: "c3b5" } },
      { cp: 100000, best: null },
    ];
    const put = await p.request.put(`${base}/api/games/${started.id}/analysis`, { data: { analysis } });
    await p.goto(`${base}/partidas/${started.id}`, { waitUntil: "networkidle" });
    await p.locator("main[data-game*='\"phase\":\"review\"']").waitFor({ timeout: 10_000 }).catch(() => undefined);
    const trap = await game();
    check(
      finished.ok() && put.ok() && trap.marks[7] === "??" && trap.marks[8] === "!!" && trap.marks.filter(Boolean).length === 2,
      `the queen given up for mate is marked "!!" (${trap.marks.map((m) => m ?? "-").join(" ")})`,
    );
    await p.locator("ol[aria-label='Lances da partida'] button").nth(8).click();
    const said = (await p.locator("p", { hasText: "Brilhante." }).first().textContent().catch(() => "")) ?? "";
    check(/^Brilhante\. Com Nxe5, você entrega a dama e dá xeque-mate em 2 lances\. Ver lances$/.test(said), `with what it gives up and what it brings (${said})`);
    await p.screenshot({ path: `${OUT}/game-brilliant.png` });
    await p.getByRole("button", { name: "Copiar PGN" }).click();
    await copied();
    const withBrilliant = await p.evaluate(() => navigator.clipboard.readText());
    check(/Nxe5\s+\$3\s+\{\s+Brilhante\.\s+Com\s+Nxe5,/.test(withBrilliant), `and in the PGN as $3 (${withBrilliant.split("\n\n")[1]?.slice(0, 120)})`);
  }

  // Somebody else's game, or no game at all, is not found, and says so.
  await p.goto(`${base}/partidas/00000000-0000-4000-8000-000000000000`, { waitUntil: "networkidle" });
  check(await waitFor("Partida não encontrada."), "an unknown game is not found");
  await p.getByRole("button", { name: "Voltar", exact: true }).click();
  await p.waitForTimeout(300);

  await p.getByRole("button", { name: "Voltar ao início" }).click();
  await p.waitForTimeout(300);
  const after = await card.textContent();
  check(/· 1 partida(?!s)/.test(after), `the home card counts one rated game (${after.replace(/\s+/g, " ")})`);
  await p.reload({ waitUntil: "networkidle" });
  check(/· 1 partida(?!s)/.test(await card.textContent()), "the game count survives a reload");

  check(errors.length === 0, `no page errors (${errors.join(" | ") || "none"})`);
  console.log(`problems: ${problems.length ? problems.join(" ; ") : "none"}`);
  await b.close();
  process.exit(problems.length ? 1 : 0);
})();
