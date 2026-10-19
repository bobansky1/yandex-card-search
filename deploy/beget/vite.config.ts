import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: fileURLToPath(new URL("./", import.meta.url)),
  publicDir: fileURLToPath(new URL("../../public", import.meta.url)),
  resolve: { alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) } },
  plugins: [react()],
  build: {
    outDir: fileURLToPath(new URL("../../beget-dist/public_html", import.meta.url)),
    emptyOutDir: true,
  },
});
