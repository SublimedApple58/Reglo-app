import { test, expect } from "@playwright/test";

/**
 * Vehicles module (M:N usage modes) — owner-facing e2e.
 *
 * Runs signed-in as the seeded owner (titolare@reglo.it). Requires the dev seed:
 *   pnpm seed:e2e:dev
 *
 * Verifies the "Modalità di utilizzo" control: switching a vehicle from Aperto
 * (open) to Esclusivo (exclusive owner) persists across a reload. Redesign
 * Impostazioni: la lista è a righe flat con "Gestisci", il vecchio dialog
 * "Modifica veicolo" è diventato il tab "Dettagli" del dettaglio inline.
 */
const MOTO = "Yamaha MT (moto E2E)";

async function openVehiclesTab(page: import("@playwright/test").Page) {
  await page.goto("/it/user/autoscuole?tab=settings");
  // Retry-click the sub-tab: the first click can land before React hydration has
  // attached the handler (it would only focus the button).
  await expect(async () => {
    await page.getByRole("button", { name: "Veicoli", exact: true }).click();
    await expect(page.getByTestId("vehicle-card").first()).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 120_000 });
}

async function openVehicleDetails(page: import("@playwright/test").Page, name: string) {
  const row = page.getByTestId("vehicle-card").filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Gestisci" }).click();
  await page.getByRole("button", { name: "Dettagli", exact: true }).click();
  await expect(page.getByTestId("vehicle-mode-open")).toBeVisible();
}

test.describe("Vehicles — usage mode", () => {
  test("switching Aperto → Esclusivo persists across reload @vehicles", async ({ page }) => {
    test.setTimeout(240_000);
    await openVehiclesTab(page);

    // Baseline: reset the moto to "Aperto" so the test is idempotent across runs.
    await openVehicleDetails(page, MOTO);
    await page.getByTestId("vehicle-mode-open").click();
    await page.getByTestId("vehicle-save").click();
    await expect(page.getByText("Veicolo aggiornato.", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    await openVehiclesTab(page);
    await openVehicleDetails(page, MOTO);
    await expect(page.getByTestId("vehicle-mode-open")).toHaveAttribute("data-active", "true");

    // Switch to Esclusivo and assign the seeded instructor.
    await page.getByTestId("vehicle-mode-exclusive").click();
    await page.getByTestId("vehicle-exclusive-instructor").click();
    await page.getByRole("option", { name: "Istruttore E2E" }).click();
    // Il click su Salva mentre il listbox Radix si sta chiudendo va perso.
    await expect(page.getByRole("listbox")).toBeHidden();
    await page.getByTestId("vehicle-save").click();
    await expect(page.getByText("Veicolo aggiornato.", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

    // Survives a fresh page load (persisted server-side, not just local state).
    await openVehiclesTab(page);
    await openVehicleDetails(page, MOTO);
    await expect(page.getByTestId("vehicle-mode-exclusive")).toHaveAttribute("data-active", "true");
  });
});
