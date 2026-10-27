import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * REG-638 Reglo Road — web del titolare.
 *
 * Dati veri su dev (`scripts/seed-reg638-road.ts`): tre guide in corso con
 * percorso e segnalazioni, una completata oggi con pagellino, storico.
 * - la voce «Road» è nella barra e apre «Dal vivo» con le auto in giro;
 * - il click su una riga mostra la card della guida, «Apri la guida» il dettaglio;
 * - «Guide di oggi» e «Storico» aprono il dettaglio di una guida registrata;
 * - Impostazioni › Reglo Road: una segnalazione personalizzata si aggiunge e si toglie.
 */

const DEV_ENV = { ...process.env, DOTENV_CONFIG_PATH: ".env.dev", NODE_OPTIONS: "--require=dotenv/config" };
const run = (args = "") => execSync(`npx tsx scripts/seed-reg638-road.ts ${args}`, { env: DEV_ENV, stdio: "pipe" }).toString();

test.use({
  viewport: { width: 1440, height: 900 },
  // La mappa è WebGL (MapLibre): in headless serve SwiftShader.
  launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
});
test.describe.configure({ mode: "serial" });
// Il dev server compila le pagine al primo accesso: i passaggi sono lenti.
test.setTimeout(150_000);

test.beforeAll(() => {
  run();
});

test.afterAll(() => {
  run("--cleanup");
});

test("Dal vivo: auto in guida, card e dettaglio", async ({ page }) => {
  await page.goto("/it/user/autoscuole");
  // la voce «Road» c'è nella barra (modulo acceso) e porta alla pagina
  const navRoad = page.getByRole("link", { name: "Road", exact: true }).first();
  await expect(navRoad).toHaveAttribute("href", /\/user\/autoscuole\/road$/, { timeout: 60_000 });
  await page.goto("/it/user/autoscuole/road");
  await expect(page.getByTestId("autoscuole-road-page").first()).toBeVisible({ timeout: 60_000 });

  const rows = page.getByTestId("road-live-row");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  expect(await rows.count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByTestId("road-live-panel")).toContainText("auto in guida");

  await rows.nth(1).click();
  const card = page.getByTestId("road-live-card");
  await expect(card).toContainText("Guida in corso");
  await expect(card.getByRole("button", { name: "Apri la guida" })).toBeVisible();
  // la mappa ha disegnato le auto
  await expect(page.locator(".road-car").first()).toBeAttached({ timeout: 30_000 });

  await card.getByRole("button", { name: "Apri la guida" }).click();
  await expect(page.getByTestId("road-detail").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("road-detail").first()).toContainText("In corso", { timeout: 30_000 });
  await expect(page.getByTestId("road-detail-markers").first()).toContainText("Semaforo", { timeout: 30_000 });
});

test("Guide di oggi e Storico aprono il dettaglio", async ({ page }) => {
  await page.goto("/it/user/autoscuole/road?view=today");
  const done = page.getByTestId("road-today-row").filter({ hasText: "Completata" }).first();
  await expect(done).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("road-today-row").filter({ hasText: "Non registrata" }).first()).toBeVisible();
  await done.click();
  const detail = page.getByTestId("road-detail").first();
  await expect(detail).toContainText("Completata", { timeout: 30_000 });
  await expect(detail).toContainText("Pagellino", { timeout: 30_000 });
  await expect(page.getByTestId("road-detail-markers").first()).toContainText("non ha guardato a destra", { timeout: 30_000 });
  await expect(detail.getByRole("link", { name: "Apri in agenda" })).toHaveAttribute("href", /tab=agenda&date=\d{4}-\d{2}-\d{2}/);

  await page.goto("/it/user/autoscuole/road?view=history");
  const row = page.getByTestId("road-history-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expect(page.getByTestId("road-detail").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Storico" })).toBeVisible();
});

test("Impostazioni › Reglo Road: aggiunge e toglie una segnalazione", async ({ page }) => {
  const label = `Prova e2e ${Date.now().toString().slice(-5)}`;
  await page.goto("/it/user/autoscuole?tab=settings&pane=road");
  const pane = page.getByTestId("road-settings-pane").first();
  await expect(pane).toBeVisible({ timeout: 60_000 });
  await expect(pane).toContainText("Segnalazioni di base");
  await expect(page.getByTestId("road-custom-row").first()).toBeVisible({ timeout: 30_000 });

  await page.getByLabel("Nuova segnalazione").fill(label);
  await page.getByRole("button", { name: "Aggiungi" }).click();
  await expect(page.getByTestId("road-custom-row").filter({ hasText: label })).toBeVisible({ timeout: 30_000 });

  // salvata davvero: dopo un reload c'è ancora
  await page.reload();
  const saved = page.getByTestId("road-custom-row").filter({ hasText: label });
  await expect(saved).toBeVisible({ timeout: 60_000 });
  await saved.getByRole("button", { name: `Togli ${label}` }).click();
  await expect(page.getByTestId("road-custom-row").filter({ hasText: label })).toHaveCount(0, { timeout: 30_000 });
});
