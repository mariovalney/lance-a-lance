// The API at /api/v1, on the real engine and the real server: a key stands for
// its account, a game starts with the computer's first move when the player
// is Black, a move comes back with the reply, a retry with the same ply is
// harmless and an old ply is refused, the app's game screen follows the moves
// made here and the API sees the app's, a stale copy of the moves cannot
// overwrite them, resigning is rated, and cancelling only works before both
// sides moved.
//
// The server needs the test key for the test account:
//   USER_API_KEYS="admin@exemplo.com|e2e-key-0123456789abcdef" ... pnpm start
//   URL=http://127.0.0.1:3111 pnpm e2e:api
const { chromium } = require("playwright");
(async () => {
  const { OUT, signedIn } = require("./env.cjs");
  const KEY = process.env.API_KEY ?? "e2e-key-0123456789abcdef";
  const b = await chromium.launch();
  const { base, ctx } = await signedIn(b);
  const problems = [];
  const check = (ok, what) => {
    console.log(`${ok ? "ok   " : "FALHA"} ${what}`);
    if (!ok) problems.push(what);
  };
  const api = async (method, path, body, key = KEY) => {
    const response = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, ...(await response.json()) };
  };

  try {
    let r = await api("GET", "/game", undefined, null);
    check(r.status === 401 && r.success === false && r.data.error === "unauthorized", "no key is a 401 in the envelope");
    r = await api("GET", "/game", undefined, "wrong-key-0123456789abcdef");
    check(r.status === 401, "an unknown key is a 401");

    r = await api("GET", "/game");
    check(r.success && (r.data.status === "none" || r.data.status === "defeat" || r.data.status === "victory" || r.data.status === "draw"), `no open game after the reset (${r.data.status})`);
    check(r.data.player && r.data.player.rating === 800 && r.data.player.played === 0 && r.data.player.suggestedLevel === 800, "the player's rating and suggested level come along");

    r = await api("POST", "/game", { level: 401 });
    check(r.status === 400 && r.data.error === "invalid_level", "a level the app does not offer is refused");

    r = await api("POST", "/game", { level: 1400, color: "black" });
    let g = r.data.game;
    check(r.status === 201 && r.data.status === "player" && g.player === "black" && g.ply === 1 && g.lastMove.by === "computer", "as Black, the game starts with the computer's move");
    check(Object.keys(g.pieces).length === 32 && g.pieces.e8.pieceType === "bK" && g.fen.split(" ")[1] === "b", "pieces and FEN describe the board");
    check(g.legalMoves.length === 20 && g.material.balance === 0 && g.result === null, "legal moves and material on the player's turn");

    r = await api("POST", "/game", { level: 800, color: "white" });
    check(r.status === 409 && r.data.error === "game_open" && r.data.game.id === g.id, "a second game is refused, with the open one");

    r = await api("POST", "/game/move", { move: "Ke7" });
    check(r.status === 400 && r.data.error === "illegal_move" && r.data.legalMoves.length === 20, "an illegal move is refused with the legal ones");

    const first = g.legalMoves.find((m) => m.san === "Nc6") ?? g.legalMoves[0];
    r = await api("POST", "/game/move", { move: first.san, ply: 1 });
    check(r.success && r.data.game.ply === 3 && r.data.game.moves[1].san === first.san && r.data.game.lastMove.by === "computer", "a move comes back with the computer's reply");
    g = r.data.game;
    r = await api("POST", "/game/move", { move: first.uci, ply: 1 });
    check(r.success && r.data.game.ply === 3 && r.data.game.lastMove.uci === g.lastMove.uci, "a retry with the same ply answers with the game");
    r = await api("POST", "/game/move", { move: g.legalMoves[0].san, ply: 1 });
    check(r.status === 409 && r.data.error === "stale_ply" && r.data.game.ply === 3, "a move for an older position is refused");

    // The app's game screen follows the moves made here.
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${base}/partida`);
    const state = async () => JSON.parse(await p.locator("main[data-game]").getAttribute("data-game"));
    const until = async (test, ms = 10_000) => {
      for (let i = 0; i < ms / 200; i++) {
        const s = await state().catch(() => null);
        if (s && test(s)) return s;
        await p.waitForTimeout(200);
      }
      return state();
    };
    let s = await until((x) => x.phase === "playing" && x.moves === 3);
    check(s.phase === "playing" && s.moves === 3 && s.player === "b", "the app resumes the game started through the API");

    r = await api("POST", "/game/move", { move: g.legalMoves[0].uci, ply: 3 });
    g = r.data.game;
    s = await until((x) => x.moves === 5 && x.legal.length > 0);
    check(r.success && g.ply === 5 && s.moves === 5, "the app shows a move made through the API on its own");

    // And the API sees the app's moves.
    const move = s.legal.find((m) => m.length === 4);
    await p.locator(`[data-square="${move.slice(0, 2)}"]`).first().tap();
    await p.locator(`[data-square="${move.slice(2, 4)}"]`).first().tap();
    s = await until((x) => x.moves === 7 && x.legal.length > 0);
    await p.waitForTimeout(500);
    r = await api("GET", "/game");
    check(s.moves === 7 && r.data.game.ply === 7 && r.data.game.moves[5].uci === move, "the API sees the move made in the app, and its reply");

    // A stale copy of the moves cannot overwrite them.
    const stale = await ctx.request.put(`${base}/api/games/${g.id}/moves`, { data: { moves: g.moves.slice(0, 3).map((m) => m.uci) } });
    check(stale.status() === 409 && (await stale.json()).error === "game_moved", "saving moves that do not continue the saved ones is a 409");
    r = await api("GET", "/game");
    check(r.data.game.ply === 7, "and the saved moves stay");

    r = await api("DELETE", "/game");
    check(r.status === 409 && r.data.error === "cannot_cancel", "a game where both sides moved cannot be called off");

    r = await api("POST", "/game/resign");
    check(r.success && r.data.status === "defeat" && r.data.game.result.reason === "resigned" && r.data.game.result.ratingDelta !== null, "resigning is a rated loss");
    check(/\[Result "1-0"\]/.test(r.data.game.pgn) && /\[Termination "abandoned"\]/.test(r.data.game.pgn), "the PGN carries the result");
    s = await until((x) => x.phase === "over");
    check(s.phase === "over", "the app shows the game ended through the API");
    await p.screenshot({ path: `${OUT}/api-over.png` });

    r = await api("GET", "/game");
    check(r.data.status === "defeat" && r.data.game.id === g.id, "with no open game, the last one is read");

    // Started here while the app sits on the result: it moves into the game.
    r = await api("POST", "/game", { level: 400, color: "black" });
    s = await until((x) => x.phase === "playing" && x.moves === 1);
    check(r.status === 201 && s.phase === "playing" && s.moves === 1, "the app picks up a game started through the API");

    r = await api("DELETE", "/game");
    check(r.success && r.data.status === "cancelled" && r.data.game === null, "a game before both sides moved is called off");
    s = await until((x) => x.phase === "setup");
    check(s.phase === "setup", "and the app goes back to the setup");
    r = await api("DELETE", "/game");
    check(r.status === 404 && r.data.error === "no_game", "with nothing open, there is nothing to call off");

    // Assisted: hints from the full-strength engine, never rated.
    r = await api("GET", "/game/hint");
    check(r.status === 404 && r.data.error === "no_game", "no hint without a game");
    r = await api("POST", "/game", { level: 800, color: "white", assisted: "yes" });
    check(r.status === 400 && r.data.error === "invalid_assisted", "assisted must be a boolean");
    r = await api("POST", "/game", { level: 800, color: "white" });
    r = await api("GET", "/game/hint");
    check(r.status === 409 && r.data.error === "not_assisted" && r.data.game.assisted === false, "a rated game gets no hint");
    await api("DELETE", "/game");
    r = await api("POST", "/game", { level: 800, color: "white", assisted: true });
    check(r.status === 201 && r.data.game.assisted === true, "a game can start assisted");
    const before = (await api("GET", "/game")).data.player;
    r = await api("GET", "/game/hint");
    const hint = r.data.hint;
    check(r.success && hint && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(hint.uci) && typeof hint.reading === "string", `an assisted game gets a hint (${hint?.san})`);
    r = await api("POST", "/game/move", { move: hint.uci, ply: 0 });
    check(r.success && r.data.game.moves[0].uci === hint.uci, "the hint is a legal move");
    r = await api("POST", "/game/move", { move: r.data.game.legalMoves[0].uci, ply: 2 });
    r = await api("POST", "/game/resign");
    check(r.success && r.data.game.result.ratingDelta === null, "an assisted game is not rated");
    r = await api("GET", "/game");
    check(r.data.player.rating === before.rating && r.data.player.played === before.played, "and leaves the rating and the count alone");

    check(errors.length === 0, `no page errors (${errors.join(" | ")})`);
  } catch (error) {
    problems.push(String(error));
    console.error(error);
  } finally {
    await b.close();
  }
  if (problems.length) {
    console.log(`\n${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log("\napi: all good");
})();
