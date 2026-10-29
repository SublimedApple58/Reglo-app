import { expect, test, type Page } from "@playwright/test";
import { NEWS_SEEN_KEYS } from "./news-seen";

/**
 * REG-645 Reglo Road — editor dei percorsi d'esame (titolare, web).
 * Nuovo percorso a punti sulla mappa → aggancio alle strade → salva → riapri →
 * archivia; poi la scorciatoia «Usa come percorso d'esame» dallo Storico.
 * L'aggancio chiama davvero Google Routes (pochi tratti, poi in cache Redis).
 */

test.setTimeout(240_000);
// Chromium headless senza GPU: WebGL software, altrimenti la mappa non si disegna.
test.use({ launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

async function waitSnapped(page: Page) {
  await expect(page.getByTestId("road-exam-snap")).toBeHidden({ timeout: 60_000 });
  await expect(page.getByTestId("road-exam-editor")).toContainText("Segue le strade.", { timeout: 60_000 });
}

test("percorsi d'esame: disegna, salva, riapri e archivia", async ({ page }) => {
  await page.addInitScript((keys) => keys.forEach((k) => localStorage.setItem(k, "1")), NEWS_SEEN_KEYS);
  await page.goto("/it/user/autoscuole?tab=settings&pane=road");
  const section = page.getByTestId("road-exam-routes");
  await expect(section).toBeVisible({ timeout: 60_000 });
  await section.getByTestId("road-exam-new").click();

  await expect(page.getByTestId("road-exam-editor")).toBeVisible({ timeout: 60_000 });
  const map = page.getByTestId("road-exam-map");
  await expect(map.locator("canvas")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const box = (await map.boundingBox())!;
  for (const [fx, fy] of [
    [0.35, 0.35],
    [0.6, 0.45],
    [0.5, 0.7],
  ]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId("road-exam-row")).toHaveCount(3);
  await waitSnapped(page);
  await expect(page.getByTestId("road-exam-km")).not.toHaveText(/^–/);

  // Togli il punto in mezzo e rimettilo: torna agganciato.
  await page.getByRole("button", { name: "Togli Punto 2" }).click();
  await expect(page.getByTestId("road-exam-row")).toHaveCount(2);
  await waitSnapped(page);

  const name = `E2E percorso ${Date.now()}`;
  await page.getByLabel("Nome").fill(name);
  await page.getByTestId("road-exam-save").click();
  await expect(page).toHaveURL(/pane=road/, { timeout: 60_000 });
  const row = page.getByTestId("road-exam-route-row").filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 60_000 });

  await row.getByRole("link", { name: `Modifica ${name}` }).click();
  await expect(page.getByTestId("road-exam-editor")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("road-exam-row")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByLabel("Nome")).toHaveValue(name);
  await page.getByRole("button", { name: "Archivia percorso" }).click();
  await expect(page).toHaveURL(/pane=road/, { timeout: 60_000 });
  await expect(page.getByTestId("road-exam-routes")).toBeVisible({ timeout: 60_000 });
  // Gli archiviati restano nascosti finché non si apre «Archiviati».
  await expect(page.getByTestId("road-exam-route-row").filter({ hasText: name })).toHaveCount(0);
});

test("scorciatoia: «Usa come percorso d'esame» dallo Storico", async ({ page }) => {
  await page.addInitScript((keys) => keys.forEach((k) => localStorage.setItem(k, "1")), NEWS_SEEN_KEYS);
  await page.goto("/it/user/autoscuole/road?view=history");
  const first = page.getByTestId("road-history-row").first();
  const visible = await first.waitFor({ timeout: 30_000 }).then(() => true, () => false);
  test.skip(!visible, "Nessuna guida nello Storico");
  await first.click();
  await expect(page.getByTestId("road-detail")).toBeVisible({ timeout: 60_000 });
  const use = page.getByTestId("road-use-as-exam");
  test.skip(!(await use.waitFor({ timeout: 20_000 }).then(() => true, () => false)), "Guida senza tracciato");
  await use.click();
  await expect(page.getByTestId("road-trim-card")).toBeVisible();
  await expect(page.getByTestId("road-trim-start")).toBeVisible();
  await expect(page.getByTestId("road-trim-end")).toBeVisible();
  await page.getByTestId("road-trim-continue").click();
  await expect(page).toHaveURL(/percorsi\/nuovo\?session=/);
  await expect(page.getByTestId("road-exam-editor")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("road-exam-row").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("road-exam-km")).not.toHaveText(/^–/);
});
