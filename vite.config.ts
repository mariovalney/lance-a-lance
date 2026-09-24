import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";

const src = path.resolve(import.meta.dirname, "./src");

/**
 * Two targets from one source tree:
 *
 * - `artifact` (the default): one HTML file for claude.ai, fonts from the CDN.
 * - `pwa`: a normal multi-file build with local fonts, a manifest and a
 *   service worker, served by the Node app in `server/`.
 *
 * Pick with `--mode pwa` (see the build:pwa script).
 */
export default defineConfig(({ mode }) => {
  const pwa = mode === "pwa";

  return {
    plugins: [react(), ...(pwa ? [dropCdnFonts(), pwaPlugin()] : [viteSingleFile()])],
    resolve: {
      alias: {
        "@": src,
        // The PWA ships the fonts itself; the artifact leaves them to the CDN.
        "virtual:fonts": path.join(src, pwa ? "styles/fonts.css" : "styles/fonts-cdn.css"),
      },
    },
    build: {
      target: "es2020",
      // The single-file build needs everything inlined. The PWA wants real
      // files, so the service worker can cache them and skip unchanged ones.
      cssCodeSplit: !pwa,
      assetsInlineLimit: pwa ? 4096 : 100000000,
      // The lesson data and the 5.353 puzzles are one big chunk on purpose.
      chunkSizeWarningLimit: 2048,
    },
  };
});

/** Removes the Google Fonts markup: the PWA has to work with no network. */
function dropCdnFonts(): Plugin {
  return {
    name: "lance-a-lance:drop-cdn-fonts",
    transformIndexHtml(html) {
      return html
        .replace(/[ \t]*<link rel="preconnect"[^>]*fonts\.(googleapis|gstatic)[^>]*>\n?/g, "")
        .replace(/[ \t]*<link\s[\s\S]*?fonts\.googleapis[\s\S]*?>\n?/g, "");
    },
  };
}

function pwaPlugin(): Plugin[] {
  return VitePWA({
    registerType: "prompt",
    includeAssets: ["favicon.svg", "apple-touch-icon.png"],
    manifest: {
      id: "/",
      name: "Lance a Lance",
      short_name: "Lance a Lance",
      description: "Curso de xadrez do zero ao intermediário, em português, com treino de puzzles.",
      lang: "pt-BR",
      dir: "ltr",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      // Matches --background and --primary in src/index.css.
      background_color: "#eff1f5",
      theme_color: "#2f4fd4",
      categories: ["education", "games"],
      icons: [
        { src: "icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    workbox: {
      // Everything is precached: the lessons and the puzzles are in the bundle
      // and the sounds are synthesized, so the app works fully offline.
      globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico,webmanifest}"],
      maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      // Any path that is not a file falls back to the app shell.
      navigateFallback: "index.html",
      navigateFallbackDenylist: [/^\/api\//],
      cleanupOutdatedCaches: true,
    },
    devOptions: { enabled: false },
  }) as Plugin[];
}
