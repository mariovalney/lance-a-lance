// A throwaway stand-in for Google's OAuth endpoints, so the sign-in flow can be
// driven end to end without touching Google.
//
//   node tests/e2e/google-sink.cjs [port]
//
// Speaks the three endpoints the server talks to, plus one of its own:
//
//   PUT  /_identity   the test says who the next person to authorize is,
//                     as {"sub": "...", "email": "...", "email_verified": true}
//   GET  /authorize   checks the client id, mints a code for that identity and
//                     sends the browser back to redirect_uri with code + state
//   POST /token       checks the code and the client credentials, answers with
//                     an access token
//   GET  /userinfo    answers with the identity behind the bearer token
//
// No signatures, no TLS, no expiry. Never point anything but a test at it.
const http = require("node:http");
const { randomUUID } = require("node:crypto");

const port = Number(process.argv[2] ?? 2626);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "test-client-secret";

/** Who the next authorize call is for. */
let identity = { sub: "google-1", email: "quem@exemplo.com", email_verified: true };
const codes = new Map();
const tokens = new Map();

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (req.method === "PUT" && url.pathname === "/_identity") {
    identity = JSON.parse(await readBody(req));
    return json(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/authorize") {
    const redirect = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state") ?? "";
    if (url.searchParams.get("client_id") !== CLIENT_ID || !redirect) return json(res, 400, { error: "invalid_request" });
    const code = randomUUID();
    codes.set(code, { identity, redirect });
    const back = new URL(redirect);
    back.searchParams.set("code", code);
    back.searchParams.set("state", state);
    res.writeHead(302, { location: back.toString() });
    return res.end();
  }

  if (req.method === "POST" && url.pathname === "/token") {
    const form = new URLSearchParams(await readBody(req));
    const issued = codes.get(form.get("code") ?? "");
    codes.delete(form.get("code") ?? "");
    if (!issued) return json(res, 400, { error: "invalid_grant" });
    if (form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) {
      return json(res, 401, { error: "invalid_client" });
    }
    if (form.get("redirect_uri") !== issued.redirect) return json(res, 400, { error: "redirect_uri_mismatch" });
    const token = randomUUID();
    tokens.set(token, issued.identity);
    return json(res, 200, { access_token: token, token_type: "Bearer", expires_in: 3600, scope: "openid email profile" });
  }

  if (req.method === "GET" && url.pathname === "/userinfo") {
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const who = tokens.get(token);
    if (!who) return json(res, 401, { error: "invalid_token" });
    return json(res, 200, who);
  }

  return json(res, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1", () => console.log(`fake google on http://127.0.0.1:${port}`));
