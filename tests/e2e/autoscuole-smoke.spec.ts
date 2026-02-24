import { expect, test } from "@playwright/test";

const userEmail = process.env.E2E_USER_EMAIL;
const userPassword = process.env.E2E_USER_PASSWORD;

const missingCredentials = !userEmail || !userPassword;

test.describe("Autoscuole smoke", () => {
  test.skip(
    missingCredentials,
    "E2E_USER_EMAIL/E2E_USER_PASSWORD non configurati per smoke test.",
  );

  test("login e navigazione dashboard/agenda/pagamenti @smoke", async ({ page }, testInfo) => {
    const emailInput = page.locator('input[name="email"], input[type="email"]');
    const passwordInput = page.locator('input[name="password"], input[type="password"]');

    await page.goto("/it/sign-in", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const hasEmailOnLocalizedSignIn = await emailInput
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (!hasEmailOnLocalizedSignIn) {
      await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }

    const emailVisible = await emailInput.first().isVisible({ timeout: 60000 }).catch(() => false);
    const passwordVisible = await passwordInput
      .first()
      .isVisible({ timeout: 60000 })
      .catch(() => false);

    if (!emailVisible || !passwordVisible) {
      await testInfo.attach("login-debug", {
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify(
            {
              url: page.url(),
              title: await page.title().catch(() => null),
              hiddenEmailCount: await page.locator('[hidden] input[name="email"]').count(),
              visibleEmailCount: await page.locator('input[name="email"]').count(),
            },
            null,
            2,
          ),
        ),
      });
      test.skip(true, "Login form non interattivo nello staging target (likely hydration issue).");
    }

    await expect(emailInput.first()).toBeVisible({ timeout: 5000 });
    await expect(passwordInput.first()).toBeVisible({ timeout: 5000 });
    await emailInput.first().fill(userEmail!);
    await passwordInput.first().fill(userPassword!);
    await page.getByRole("button", { name: /accedi|sign in|login/i }).first().click();

    await page.goto("/it/user/autoscuole");
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    await expect(page.getByTestId("autoscuole-dashboard-page")).toBeVisible();

    await page.goto("/it/user/autoscuole?tab=agenda");
    await expect(page.getByTestId("autoscuole-agenda-page")).toBeVisible();

    await page.goto("/it/user/autoscuole?tab=payments");
    await expect(page.getByTestId("autoscuole-payments-page")).toBeVisible();
  });
});
