import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/hosted/",
  root: "src/hosted-login",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist/hosted-login",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        hosted: "index.html",
        admin: "admin.html"
      }
    }
  }
});
