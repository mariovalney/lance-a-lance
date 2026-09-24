// Rasterizes assets/icon.svg and assets/icon-maskable.svg into the PNGs the
// manifest and iOS need. Run it again after editing either SVG:
//
//   node scripts/gen-icons.mjs
//
// Uses the Chromium that Playwright already installs for the E2E scripts, so
// there is no image library to add.
import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { chromium } from "playwright";

const TARGETS = [
  { svg: "assets/icon.svg", out: "public/icon-192.png", size: 192 },
  { svg: "assets/icon.svg", out: "public/icon-512.png", size: 512 },
  // iOS does not apply a mask and does not round the corners of this one itself
  // on older versions, so it gets the rounded art rather than the maskable one.
  { svg: "assets/icon.svg", out: "public/apple-touch-icon.png", size: 180 },
  { svg: "assets/icon-maskable.svg", out: "public/icon-maskable-512.png", size: 512 },
];

mkdirSync("public", { recursive: true });

const browser = await chromium.launch();
try {
  for (const { svg, out, size } of TARGETS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const markup = readFileSync(svg, "utf8");
    await page.setContent(
      `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
      { waitUntil: "load" },
    );
    await page.locator("svg").screenshot({ path: out, omitBackground: true });
    await page.close();
    console.log(`${out} ${size}x${size} ${(statSync(out).size / 1024).toFixed(1)} KB`);
  }
} finally {
  await browser.close();
}

// The browser tab icon: the SVG itself, no rasterizing needed.
copyFileSync("assets/icon.svg", "public/favicon.svg");
console.log("public/favicon.svg");
