import { expect, test } from "@playwright/test";
import { NEWS_SEEN_KEYS } from "./news-seen";

/**
 * REG-644 Reglo Road — vista web «Punti critici»: lista numerata, dettaglio del
 * punto con allievi e guide, ritorno alla lista, apertura della guida e ritorno
 * al «Punti critici» dal breadcrumb. Servono Road acceso e i dati di prova di
 * `scripts/seed-road-hotspots.ts`.
 */

test.setTimeout(180_000);

test("punti critici web: lista, dettaglio, guida e ritorno", async ({ page }) => {
  await page.addInitScript((keys) => keys.forEach((k) => localStorage.setItem(k, "1")), NEWS_SEEN_KEYS);
  await page.goto("/it/user/autoscuole/road?view=hotspots");
  await expect(page.getByTestId("road-hotspots")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("road-tab-hotspots")).toHaveAttribute("aria-current", "page");

  const rows = page.getByTestId("road-hotspot-row");
  const empty = page.getByTestId("road-hotspots-empty");
  await expect(rows.first().or(empty)).toBeVisible({ timeout: 60_000 });
  test.skip(await empty.isVisible(), "Mancano i dati di prova (scripts/seed-road-hotspots.ts)");

  await expect(rows.first()).toContainText("Precedenza");
  await rows.first().click();
  const detail = page.getByTestId("road-hotspot-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Allievi che ci sbagliano");
  await expect(page.getByTestId("road-hotspot-session")).toHaveCount(5);

  await detail.getByRole("button", { name: "Tutti i punti" }).click();
  await expect(page.getByTestId("road-hotspots-list")).toBeVisible();

  await rows.first().click();
  await page.getByTestId("road-hotspot-session").first().click();
  await expect(page).toHaveURL(/from=hotspots/);
  await expect(page.getByTestId("road-detail")).toBeVisible({ timeout: 60_000 });
  // REG-716: niente breadcrumb, un solo ritorno; riapre il punto da cui si era partiti.
  await expect(page.getByTestId("road-back")).toHaveText(/Punti critici/);
  await page.getByTestId("road-back").click();
  await expect(page).toHaveURL(/view=hotspots.*point=/);
  await expect(page.getByTestId("road-hotspot-detail")).toBeVisible({ timeout: 60_000 });
});
