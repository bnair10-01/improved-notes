import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { THEME_INIT_SCRIPT } from "./src/lib/theme";
import { A11Y_INIT_SCRIPT } from "./src/lib/a11y";

// Theme and accessibility preferences are applied inline, before first paint, so there is no flash.
const inlineInitScripts = (): Plugin => ({
  name: "inline-init-scripts",
  transformIndexHtml: { order: "pre", handler: (html) => html.replace("<!--init-scripts-->", `<script>${THEME_INIT_SCRIPT}${A11Y_INIT_SCRIPT}</script>`) },
});

export default defineConfig({
  plugins: [
    inlineInitScripts(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  server: { port: 5173 },
  build: { target: "es2022", sourcemap: true },
});
