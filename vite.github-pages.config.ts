import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const publicBase = "/honeybee-harvest-world/";

function rewritePublicAssetPaths(): Plugin {
  return {
    name: "rewrite-github-pages-public-assets",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/").split("?")[0];

      if (normalizedId.endsWith("/app/page.tsx")) {
        return {
          code: code
            .replaceAll('"/sfx/', `"${publicBase}sfx/`)
            .replaceAll('"/bee-character-', `"${publicBase}bee-character-`)
            .replaceAll('"/honey-thief-bear.png"', `"${publicBase}honey-thief-bear.png"`)
            .replaceAll('"/monster-', `"${publicBase}monster-`)
            .replaceAll('"/enemy-', `"${publicBase}enemy-`)
            .replaceAll('"/rocket-gold-', `"${publicBase}rocket-gold-`)
            .replaceAll('"/bamboo-copter-', `"${publicBase}bamboo-copter-`)
            .replaceAll('"/flower-platform-', `"${publicBase}flower-platform-`)
            .replaceAll('"/spring-flower-', `"${publicBase}spring-flower-`)
            .replaceAll('"/honey-jar-', `"${publicBase}honey-jar-`)
            .replaceAll('"/game-background-long.png"', `"${publicBase}game-background-long.png"`),
          map: null,
        };
      }

      if (normalizedId.endsWith("/app/globals.css")) {
        return {
          code: code.replaceAll("url('/", `url('${publicBase}`),
          map: null,
        };
      }

      return null;
    },
  };
}

export default defineConfig({
  root: "pages",
  base: publicBase,
  publicDir: "../public",
  plugins: [rewritePublicAssetPaths(), react()],
  build: {
    outDir: "../github-pages-dist",
    emptyOutDir: true,
  },
});
