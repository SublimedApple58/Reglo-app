import { expect, test } from "@playwright/test";
import { NEWS_SEEN_KEYS } from "./news-seen";

/**
 * REG-716 (REG-718…721) — navigazione di Road sul web, titolare:
 * - tab di sezione nell'URL, con i percorsi d'esame dentro Road;
 * - dal dettaglio guida un solo ritorno («‹ Storico»), che riporta ai filtri;
 * - su/giù tra le guide della lista;
 * - scheda allievo con URL (`?student=&pane=road`) e tab «Road»;
 * - Storico a 390 px: il nome dell'allievo resta visibile.
 * Servono le guide Road della demo (vedi docs/STAGING.md › Reglo Road su staging).
 */

test.setTimeout(180_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript((keys) => keys.forEach((k) => localStorage.setItem(k, "1")), NEWS_SEEN_KEYS);
});

test("tab di sezione e percorsi d'esame dentro Road", async ({ page }) => {
  await page.goto("/it/user/autoscuole/road?view=history");
  await expect(page.getByTestId("road-tab-history")).toHaveAttribute("aria-current", "page", { timeout: 60_000 });
  await expect(page.getByTestId("road-subtitle")).toHaveText("Le guide registrate, dalla più recente");
  await page.getByTestId("road-tab-routes").click();
  await expect(page).toHaveURL(/view=routes/);
  await expect(page.getByTestId("road-exam-routes")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("road-settings-link")).toHaveAttribute("href", /tab=settings&pane=road/);
});

test("dettaglio: ritorno ai filtri dello Storico e su/giù", async ({ page }) => {
  await page.goto("/it/user/autoscuole/road?view=history&days=all");
  const rows = page.getByTestId("road-history-row");
  const has = await rows.nth(1).waitFor({ timeout: 60_000 }).then(() => true, () => false);
  test.skip(!has, "Servono almeno due guide nello Storico");

  await rows.first().click();
  await expect(page).toHaveURL(/from=history/);
  await expect(page.getByTestId("road-detail")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("navigation", { name: "Percorso" })).toHaveCount(0);
  const stepper = page.getByTestId("road-detail-stepper");
  await expect(stepper).toContainText("1 di");
  const firstUrl = page.url();
  await stepper.getByRole("button", { name: /Guida dopo/ }).click();
  await expect(stepper).toContainText("2 di");
  expect(page.url()).not.toBe(firstUrl);

  await expect(page.getByTestId("road-back")).toHaveText(/Storico/);
  await page.getByTestId("road-back").click();
  await expect(page).toHaveURL(/view=history&days=all/);
});

test("scheda allievo con URL e tab Road", async ({ page }) => {
  await page.goto("/it/user/autoscuole/road?view=history&days=all");
  const row = page.getByTestId("road-history-row").first();
  const has = await row.waitFor({ timeout: 60_000 }).then(() => true, () => false);
  test.skip(!has, "Nessuna guida nello Storico");
  await row.click();
  const student = page.getByTestId("road-detail-student");
  await expect(student).toBeVisible({ timeout: 60_000 });
  await student.click();
  await expect(page).toHaveURL(/tab=students&student=[^&]+&pane=road/, { timeout: 60_000 });
  const tab = page.getByTestId("student-road-tab");
  await expect(tab).toBeVisible({ timeout: 60_000 });
  await expect(tab).toContainText("Ultime guide", { timeout: 60_000 });

  // Dalla scheda al dettaglio e ritorno: «‹ <allievo>» riapre la scheda sulla tab Road.
  await page.getByTestId("student-road-session").first().click();
  await expect(page).toHaveURL(/from=student/);
  await page.getByTestId("road-back").click();
  await expect(page).toHaveURL(/pane=road/, { timeout: 60_000 });
  await expect(page.getByTestId("student-road-tab")).toBeVisible({ timeout: 60_000 });
});

test.describe("390 px", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("Storico: il nome dell'allievo si vede", async ({ page }) => {
    await page.goto("/it/user/autoscuole/road?view=history&days=all");
    const name = page.getByTestId("road-history-student").first();
    const has = await name.waitFor({ timeout: 60_000 }).then(() => true, () => false);
    test.skip(!has, "Nessuna guida nello Storico");
    const box = await name.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(60);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(scroll).toBeLessThanOrEqual(0);
  });
});
