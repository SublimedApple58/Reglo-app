import { expect, test, type Page } from "@playwright/test";

/**
 * REG-657 Reglo Road — sulla mappa web la sede è una sola (edificio 3D,
 * etichetta nera) e i luoghi hanno il loro segnaposto (`.road-luogo`); nel
 * dettaglio guida la partenza è un'etichetta con l'orario, non l'icona della
 * sede. Su staging «Autoscuola Reglo» ha un luogo in più («Piazzale Lotto»).
 */

test.setTimeout(150_000);

const SHOTS = process.env.HIRO_SHOT_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

test("mappa live: una sede e i luoghi col loro segnaposto", async ({ page }) => {
  await page.goto("/it/user/autoscuole/road");
  const map = page.getByTestId("road-live-map");
  await expect(map).toBeVisible({ timeout: 60_000 });
  const live = await page.evaluate(async () => (await fetch("/api/autoscuole/road/live", { cache: "no-store" })).json());
  const places = (live.data?.places ?? []) as Array<{ name: string }>;

  await expect(map.locator(".road-sede")).toHaveCount(live.data?.base ? 1 : 0, { timeout: 30_000 });
  await expect(map.locator(".road-luogo")).toHaveCount(places.length, { timeout: 30_000 });
  for (const p of places) await expect(map.locator(".road-luogo", { hasText: p.name })).toHaveCount(1);
  if (places.length) await expect(map.getByText("Luogo", { exact: true })).toBeVisible();

  // Allontana finché sede e luoghi stanno insieme nell'inquadratura.
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "Allontana" }).click();
  await page.waitForTimeout(2_500);
  await shot(page, "05-web-mappa-sede-e-luoghi");
});

test("dettaglio guida: la partenza non è la sede", async ({ page }) => {
  await page.goto("/it/user/autoscuole/road?view=history");
  const res = await page.evaluate(async () => (await fetch("/api/autoscuole/road/history?limit=10", { cache: "no-store" })).json());
  const item = (res.data?.items ?? []).find((i: { distanceMeters?: number | null }) => (i.distanceMeters ?? 0) > 200);
  test.skip(!item, "nessuna guida registrata su staging");
  await page.goto(`/it/user/autoscuole/road/${item.id}?from=history`);
  const start = page.locator(".road-start-lab");
  await expect(start).toBeVisible({ timeout: 60_000 });
  await expect(start).toContainText("Partenza");
  await expect(page.locator(".road-sede")).toHaveCount(0);
  await page.waitForTimeout(2_000);
  await shot(page, "06-web-dettaglio-partenza");
});
