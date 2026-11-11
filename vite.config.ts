import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@flayr/i18n": fileURLToPath(
        new URL("./src/i18n-runtime", import.meta.url),
      ),
    },
  },
  optimizeDeps: {
    exclude: ["@flayr/i18n/jsx-runtime", "@flayr/i18n/jsx-dev-runtime"],
  },
  plugins: [
    mdx({ remarkPlugins: [remarkGfm], jsxImportSource: "@flayr/i18n" }),
    react({ jsxImportSource: "@flayr/i18n" }),
    tailwind(),
  ],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: { chunkSizeWarningLimit: 1100 },
});
