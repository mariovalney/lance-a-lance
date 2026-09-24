import { execSync } from "node:child_process";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * What the footer shows. Easypanel hands the commit it is building to the
 * Dockerfile as the GIT_SHA build arg; outside it, the checkout answers.
 */
function version(): string {
  const fromBuild = process.env.GIT_SHA?.trim();
  if (fromBuild) return fromBuild.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

export default defineConfig({
  plugins: [react(), ...pwaPlugin()],
  define: { __APP_VERSION__: JSON.stringify(version()) },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  build: {
    target: "es2020",
    // Real files, so the service worker can cache them and skip the unchanged.
    assetsInlineLimit: 4096,
    // The lesson data and the 5.353 puzzles are one big chunk on purpose.
    chunkSizeWarningLimit: 2048,
  },
});

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
