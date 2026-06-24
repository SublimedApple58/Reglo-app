import path from "path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

// Shared signed-in state produced by tests/e2e/auth.setup.ts (the owner login).
export const OWNER_STORAGE_STATE = path.join(__dirname, "tests/e2e/.auth/owner.json");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Logs in once and persists storageState for the authenticated specs.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      // Unauthenticated specs (e.g. the existing smoke that logs in itself).
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [/.*\.setup\.ts/, /.*\.auth\.spec\.ts/],
    },
    {
      // Specs that must run signed-in as the owner (e.g. vehicles).
      name: "chromium-auth",
      testMatch: /.*\.auth\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: OWNER_STORAGE_STATE },
      dependencies: ["setup"],
    },
  ],
  // Boot the app locally only when no external target is provided (CI points
  // E2E_BASE_URL at a Vercel preview instead). Next-only (no Trigger worker).
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev:e2e",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
