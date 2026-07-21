import { test, expect } from "@playwright/test";

/**
 * Staging smoke for the vehicles release. Runs signed-in as the seeded owner
 * against E2E_BASE_URL (staging.reglo.it). Data-agnostic: doesn't depend on a
 * specific vehicle name — just verifies the key pages load and the vehicles
 * REDESIGN UI (usage-mode control) is present.
 */
test.describe("Staging smoke — vehicles release", () => {
  test("landing (agenda), agenda tab, and vehicles redesign load @staging", async ({ page }) => {
    // Redesign 2026-07: la Dashboard è stata ritirata — la landing è l'Agenda.
    await page.goto("/it/user/autoscuole");
    await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible({ timeout: 60_000 });

    await page.goto("/it/user/autoscuole?tab=agenda");
    await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible({ timeout: 60_000 });

    // Vehicles redesign: settings → Veicoli → a card → the new usage-mode control.
    await page.goto("/it/user/autoscuole?tab=settings");
    await expect(async () => {
      await page.getByRole("button", { name: "Veicoli", exact: true }).click();
      await expect(page.getByTestId("vehicle-card").first()).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 45_000 });

    await page.getByTestId("vehicle-card").first().getByTitle("Modifica veicolo").click();
    const dialog = page.getByRole("dialog");
    // The redesigned dialog exposes the Aperto/Pool/Esclusivo segmented control.
    await expect(dialog.getByTestId("vehicle-mode-exclusive")).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByTestId("vehicle-mode-pool")).toBeVisible();
  });
});
