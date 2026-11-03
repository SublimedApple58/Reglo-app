import { test, expect, type APIRequestContext } from "@playwright/test";
import { markNewsSeen } from "./news-seen";

/**
 * REG-705c — luogo sulle fasce nel tab Disponibilità dell'istruttore (web).
 * Gira come il titolare del seed. Accende «Disponibilità per luogo», sceglie un
 * luogo per la prima fascia, ricarica e lo ritrova; poi la rimette su «Tutti i
 * luoghi» (fasce identiche a prima) e ripristina il setting.
 *
 * Condivide il setting con `reg705-luoghi-allievo`: lanciali con `--workers=1`.
 */

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page }) => {
  await markNewsSeen(page);
});

const URL = "/it/user/autoscuole?tab=settings&pane=instructors";

async function patchSettings(request: APIRequestContext, data: Record<string, unknown>) {
  const res = await request.patch("/api/autoscuole/settings", { data });
  expect((await res.json()).success).toBe(true);
}

async function openAvailability(page: import("@playwright/test").Page) {
  await page.goto(URL);
  const gestisci = page.getByRole("button", { name: "Gestisci" });
  await expect(gestisci.first()).toBeVisible({ timeout: 120_000 });
  await gestisci.first().click();
  await page.getByRole("button", { name: "Disponibilità", exact: true }).click();
}

test("luogo della fascia nella settimana tipo", async ({ page, request }) => {
  const original = (await (await request.get("/api/autoscuole/settings")).json()).data;
  const locations = (await (await request.get("/api/autoscuole/locations")).json()).data as {
    id: string;
    name: string;
  }[];
  test.skip(locations.length < 2, "Servono almeno due luoghi nel seed.");
  await patchSettings(request, { availabilityByLocation: true });

  try {
    await openAvailability(page);
    const list = page.getByTestId("located-range-list").first();
    await expect(list).toBeVisible({ timeout: 30_000 });
    const select = list.getByTestId("range-location-select").first();
    const before = (await select.textContent())?.trim() ?? "";

    // Un luogo diverso da quello attuale.
    const target = locations.find((l) => l.name !== before) ?? locations[0];
    await select.click();
    await page.getByRole("menuitem").filter({ hasText: target.name }).first().click();
    await expect(select).toHaveText(target.name);

    // Salvato davvero: ricaricando torna lo stesso luogo.
    await page.waitForTimeout(1500);
    await openAvailability(page);
    const again = page.getByTestId("located-range-list").first().getByTestId("range-location-select").first();
    await expect(again).toHaveText(target.name, { timeout: 30_000 });

    // Rimette «Tutti i luoghi» (la fascia torna senza luogo, come prima).
    await again.click();
    await page.getByRole("menuitem").filter({ hasText: "Tutti i luoghi" }).click();
    await expect(again).toHaveText("Tutti i luoghi");
    await page.waitForTimeout(1500);
  } finally {
    await patchSettings(request, { availabilityByLocation: original.availabilityByLocation === true });
  }
});

test("spenta la funzione, le fasce restano pillole senza luogo", async ({ page, request }) => {
  const original = (await (await request.get("/api/autoscuole/settings")).json()).data;
  await patchSettings(request, { availabilityByLocation: false });
  try {
    await openAvailability(page);
    await expect(page.getByText("Fasce orarie").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("located-range-list")).toHaveCount(0);
  } finally {
    await patchSettings(request, { availabilityByLocation: original.availabilityByLocation === true });
  }
});
