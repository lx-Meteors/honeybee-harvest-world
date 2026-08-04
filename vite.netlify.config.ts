import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function fixNetlifyDocumentPaths(): Plugin {
  return {
    name: "fix-netlify-document-paths",
    transformIndexHtml(html) {
      return html.replaceAll("/honeybee-harvest-world/", "/");
    },
  };
}

export default defineConfig({
  root: "pages",
  base: "/",
  publicDir: "../public",
  plugins: [fixNetlifyDocumentPaths(), react()],
  build: {
    outDir: "../netlify-dist",
    emptyOutDir: true,
  },
});
