// Turns dist/index.html (single file from vite-plugin-singlefile) into the
// body-only format the claude.ai Artifact publisher expects: no doctype,
// html, head or body tags; title and styles at the top.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");

const pick = (re, label) => {
  const m = html.match(re);
  if (!m) throw new Error(`Missing ${label} in dist/index.html`);
  return m[0];
};

const title = pick(/<title>[\s\S]*?<\/title>/, "title");
const fontLinks = html.match(/<link[^>]*fonts\.(googleapis|gstatic)[^>]*>/g) ?? [];
const style = pick(/<style[^>]*>[\s\S]*?<\/style>/, "style").replace(/<style[^>]*>/, "<style>");
const script = pick(/<script type="module"[^>]*>[\s\S]*?<\/script>/, "script").replace(/<script[^>]*>/, '<script type="module">');

const out = [title, ...fontLinks, style, '<div id="root"></div>', script].join("\n");

mkdirSync("artifact", { recursive: true });
writeFileSync("artifact/lance-a-lance.html", out);
console.log(`artifact/lance-a-lance.html ${(out.length / 1024).toFixed(0)} KB`);
