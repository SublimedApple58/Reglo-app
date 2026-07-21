import path from "path";
import { test as setup, expect } from "@playwright/test";

// Must match OWNER_STORAGE_STATE in playwright.config.ts.
const OWNER_STORAGE_STATE = path.join(__dirname, ".auth/owner.json");

// Defaults match the dev seed (scripts/seed-e2e.ts). Override via env in CI.
const email = process.env.E2E_OWNER_EMAIL || "titolare@reglo.it";
const password = process.env.E2E_PASSWORD || "RegloTest2026!";

/**
 * Authenticate via the Auth.js credentials endpoint (CSRF + callback) instead of
 * driving the sign-in form. This is far more robust than the client-side UI flow
 * and sets the same session cookie. The cookie is captured into storageState and
 * reused by the authenticated specs.
 */
setup("authenticate as owner", async ({ page, baseURL }) => {
  const csrfRes = await page.request.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email,
      password,
      callbackUrl: `${baseURL ?? ""}/it/user/autoscuole`,
      json: "true",
    },
  });

  // Verify the session is real: the autoscuole landing (Agenda, redesign 2026-07)
  // renders (no redirect back to /sign-in). First hit may compile the route.
  await page.goto("/it/user/autoscuole");
  await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible({
    timeout: 60_000,
  });

  await page.context().storageState({ path: OWNER_STORAGE_STATE });
});
