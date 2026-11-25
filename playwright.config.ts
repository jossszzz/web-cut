import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Pocos workers: la exportación es intensiva (en CI los runners tienen 2–4
  // núcleos y en local así no se satura el equipo). La suite completa se
  // ejecuta en GitHub Actions (.github/workflows/ci.yml).
  workers: 2,
  retries: process.env.CI ? 2 : 0,
  // En CI, los fallos se publican además como anotaciones de GitHub (visibles sin descargar logs).
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "on-first-retry",
  },
  // Chromium cubre Chrome y Edge (mismo motor); WebKit es el motor de Safari.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } } },
    { name: "webkit", use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
