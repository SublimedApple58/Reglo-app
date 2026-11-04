import { expect, test } from "@playwright/test";

/**
 * REG-713 Reglo Road — il dettaglio di una guida in lettura non ricalcola né
 * riscrive niente: i km del dettaglio sono quelli dello storico e restano
 * uguali a ogni apertura. Sola lettura sulle guide già nello storico.
 * `E2E_ROAD_SESSION_ID` = guida precisa da aprire (es. una senza traccia salvata).
 */

test.setTimeout(120_000);

type Item = { id: string; distanceMeters: number };

test("km uguali fra storico e dettaglio, e fermi fra due aperture", async ({ page }) => {
  await page.goto("/it/user/autoscuole/road?view=history");
  const history = await page.evaluate(async () => (await fetch("/api/autoscuole/road/history?limit=20", { cache: "no-store" })).json());
  const items = (history.data?.items ?? []) as Item[];
  const wanted = process.env.E2E_ROAD_SESSION_ID;
  const picked = wanted ? items.filter((i) => i.id === wanted) : items.slice(0, 3);
  test.skip(!picked.length, "Nessuna guida Road nello storico");

  for (const item of picked) {
    const read = () =>
      page.evaluate(async (id) => (await fetch(`/api/autoscuole/road/sessions/${id}`, { cache: "no-store" })).json(), item.id);
    const first = await read();
    const second = await read();
    expect(first.success).toBe(true);
    expect(first.data.distanceMeters).toBe(item.distanceMeters);
    expect(second.data.distanceMeters).toBe(item.distanceMeters);
    expect(second.data.track).toEqual(first.data.track);

    await page.goto(`/it/user/autoscuole/road/${item.id}?from=history`);
    await expect(page.getByText(/km/).first()).toBeVisible({ timeout: 30_000 });
  }
});
