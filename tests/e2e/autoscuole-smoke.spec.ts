import { expect, test } from "@playwright/test";

const userEmail = process.env.E2E_USER_EMAIL;
const userPassword = process.env.E2E_USER_PASSWORD;

const missingCredentials = !userEmail || !userPassword;

test.describe("Autoscuole smoke", () => {
  test.skip(
    missingCredentials,
    "E2E_USER_EMAIL/E2E_USER_PASSWORD non configurati per smoke test.",
  );

  test("login e navigazione dashboard/agenda/pagamenti @smoke", async ({ page }) => {
    await page.goto("/it/sign-in");
    await page.getByLabel("Email").fill(userEmail!);
    await page.getByLabel("Password").fill(userPassword!);
    await page.getByRole("button", { name: "Accedi" }).click();

    await page.goto("/it/user/autoscuole");
    await expect(page.getByTestId("app-sidebar")).toBeVisible();
    await expect(page.getByTestId("autoscuole-dashboard-page")).toBeVisible();

    await page.goto("/it/user/autoscuole?tab=agenda");
    await expect(page.getByTestId("autoscuole-agenda-page")).toBeVisible();

    await page.goto("/it/user/autoscuole?tab=payments");
    await expect(page.getByTestId("autoscuole-payments-page")).toBeVisible();
  });
});
