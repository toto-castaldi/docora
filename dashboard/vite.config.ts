import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";

const versionFile = fs.readFileSync(
  path.resolve(__dirname, "..", "src", "version.ts"),
  "utf-8"
);
const versionMatch = versionFile.match(/VERSION\s*=\s*"([^"]+)"/);
const appVersion = versionMatch ? versionMatch[1] : "unknown";

export default defineConfig({
  plugins: [react()],
  base: "/admin/",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/admin/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
