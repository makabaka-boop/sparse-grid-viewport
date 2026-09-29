import { defineConfig } from "@playwright/test";

// Docker 镜像内以 root 运行 Chromium 需要 --no-sandbox
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: isRoot ? ["--no-sandbox"] : [] },
  },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
