import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const adminApiTarget =
  process.env.AUTH_ADMIN_API_TARGET ?? "https://auth.nezdemkovski.cloud";
const adminApiOrigin = new URL(adminApiTarget).origin;

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : "/admin/",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "auth-admin-spa-fallback",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (!req.url) {
            next();
            return;
          }

          if (
            (req.url === "/admin" || req.url.startsWith("/admin/")) &&
            !req.url.startsWith("/admin/api")
          ) {
            req.url = "/index.html";
          }

          next();
        });
      }
    }
  ],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      "/admin/api": {
        target: adminApiTarget,
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: "",
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("origin", adminApiOrigin);
            proxyReq.setHeader("referer", `${adminApiOrigin}/admin`);
          });
        }
      }
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        admin: "index.html"
      }
    }
  }
}));
