import { test, expect } from "@playwright/test";

/**
 * Vehicles module (M:N usage modes) — owner-facing e2e.
 *
 * Runs signed-in as the seeded owner (titolare@reglo.it). Requires the dev seed:
 *   pnpm seed:e2e:dev
 *
 * Verifies the new "Modalità di utilizzo" control: switching a vehicle from
 * Aperto (open) to Esclusivo (exclusive owner) persists across a reload — the
 * card badge reflects the saved mode.
 */
const MOTO = "Yamaha MT (moto E2E)";

async function openVehiclesTab(page: import("@playwright/test").Page) {
  await page.goto("/it/user/autoscuole?tab=settings");
  // Retry-click the sub-tab: the first click can land before React hydration has
  // attached the handler (it would only focus the button). Re-click until the
  // VehiclesTab content (seeded cards) actually renders.
  await expect(async () => {
    await page.getByRole("button", { name: "Veicoli", exact: true }).click();
    await expect(page.getByTestId("vehicle-card").first()).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 45_000 });
}

test.describe("Vehicles — usage mode", () => {
  test("switching Aperto → Esclusivo persists across reload @vehicles", async ({ page }) => {
    await openVehiclesTab(page);

    const card = page.getByTestId("vehicle-card").filter({ hasText: MOTO });
    await expect(card).toBeVisible();

    // Baseline: reset the moto to "Aperto" so the test is idempotent across runs.
    await card.getByTitle("Modifica veicolo").click();
    let dialog = page.getByRole("dialog");
    await dialog.getByTestId("vehicle-mode-open").click();
    await dialog.getByTestId("vehicle-save").click();
    await expect(dialog).toBeHidden();
    await expect(card.getByText("Aperto", { exact: true })).toBeVisible();

    // Switch to Esclusivo and assign the seeded instructor.
    await card.getByTitle("Modifica veicolo").click();
    dialog = page.getByRole("dialog");
    await dialog.getByTestId("vehicle-mode-exclusive").click();
    await dialog.getByTestId("vehicle-exclusive-instructor").click();
    await page.getByRole("option", { name: "Istruttore E2E" }).click();
    await dialog.getByTestId("vehicle-save").click();
    await expect(dialog).toBeHidden();

    // The card badge now reads "Esclusivo".
    await expect(card.getByText("Esclusivo", { exact: true })).toBeVisible();

    // And it survives a fresh page load (persisted server-side, not just local
    // state). Re-open the Veicoli tab from scratch (the sub-tab is local state,
    // reset on navigation) and re-assert the badge.
    await openVehiclesTab(page);
    const cardAfter = page.getByTestId("vehicle-card").filter({ hasText: MOTO });
    await expect(cardAfter.getByText("Esclusivo", { exact: true })).toBeVisible();
  });
});
