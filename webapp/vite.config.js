import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Load the root project's .env so Vite's /api proxy always points at whatever
// port the backend is actually running on (e.g. PORT=1488 in the root .env).
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, ".."), "");
  const BACKEND_PORT =
    Number(rootEnv.PORT) || Number(rootEnv.BACKEND_PORT) || 3000;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: `http://localhost:${BACKEND_PORT}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
    },
  };
});