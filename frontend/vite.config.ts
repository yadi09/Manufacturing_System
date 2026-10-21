import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Crown Manufacturing",
        short_name: "Crown",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0f766e",
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,woff2}"] },
    }),
  ],
  server: { port: 5173, proxy: { "/healthz": "http://localhost:8080", "/api": "http://localhost:8080" } },
  test: { include: ["src/**/*.test.{ts,tsx}"], testTimeout: 20_000, setupFiles: ["src/test/setup.ts"] }, // the 220-year round trip can stall when the machine is busy
});
