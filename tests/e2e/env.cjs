// Shared paths for the Playwright scripts. Run `pnpm e2e:prepare` first to build the skeleton page.
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(__dirname, ".out");
fs.mkdirSync(OUT, { recursive: true });

module.exports = { ROOT, OUT, SKELETON: path.join(OUT, "skeleton.html") };
