import { expect, test, type Page } from "@playwright/test";

/**
 * REG-656 Reglo Road — senza l'indirizzo della sede il titolare viene fermato.
 * Su staging («Autoscuola Reglo», sede a Milano): si spegne «Posizione precisa»
 * sulla sede (coordinate via), il foglio bloccante compare in Impostazioni ›
 * Reglo Road e nelle pagine Road, non si chiude con Esc; la posizione del
 * browser propone l'indirizzo più vicino; si salva cercando l'indirizzo e la
 * sede torna con le coordinate. Le anteprime vanno in HIRO_SHOT_DIR, se c'è.
 */

test.setTimeout(240_000);

const SHOTS = process.env.HIRO_SHOT_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const hqStatus = (page: Page) =>
  page.evaluate(async () => (await fetch("/api/autoscuole/road/headquarters", { cache: "no-store" })).json());

test.use({ geolocation: { latitude: 45.4654, longitude: 9.1859 }, permissions: ["geolocation"] });

test("foglio della sede: bloccante per il titolare, si sblocca salvando", async ({ page }) => {
  // 1. Sede senza coordinate: «Posizione precisa» spenta.
  await page.goto("/it/user/autoscuole?tab=settings&pane=locations");
  await page.getByRole("button", { name: "Modifica" }).first().click();
  const precise = page.getByRole("switch", { name: /Posizione precisa/ });
  await expect(precise).toBeVisible({ timeout: 60_000 });
  if ((await precise.getAttribute("aria-checked")) === "true") await precise.click();
  await page.getByRole("button", { name: "Salva luogo" }).click();
  await expect(page.getByRole("button", { name: "Salva luogo" })).toBeHidden({ timeout: 30_000 });
  await expect.poll(async () => (await hqStatus(page)).data?.missing, { timeout: 30_000 }).toBe(true);

  try {
    // 2. Impostazioni › Reglo Road: il foglio c'è e non si chiude.
    await page.goto("/it/user/autoscuole?tab=settings&pane=road");
    const gate = page.getByTestId("road-hq-gate");
    await expect(gate).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(600);
    await shot(page, "01-web-foglio-sede-impostazioni");
    await page.keyboard.press("Escape");
    await expect(gate).toBeVisible();
    await expect(page.getByTestId("road-hq-save")).toBeDisabled();

    // 3. Pagina Road: stesso foglio; la posizione del browser propone l'indirizzo.
    await page.goto("/it/user/autoscuole/road");
    await expect(gate).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("road-hq-locate").click();
    await expect(page.getByTestId("road-hq-picked")).toContainText("Dalla tua posizione attuale", { timeout: 30_000 });
    await page.waitForTimeout(400);
    await shot(page, "02-web-foglio-sede-posizione");

    // 4. Cambia → indirizzo cercato → Salva e continua.
    await page.getByRole("button", { name: "Cambia" }).click();
    await page.getByTestId("road-hq-address").fill("Via Roma 42 Milano");
    const first = gate.locator("button").filter({ hasText: "Via Roma" }).first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(300);
    await shot(page, "03-web-foglio-sede-ricerca");
    await first.click();
    await expect(page.getByTestId("road-hq-picked")).toContainText("Da Google Maps", { timeout: 30_000 });
    await page.getByTestId("road-hq-save").click();
    await expect(gate).toBeHidden({ timeout: 30_000 });
    await expect.poll(async () => (await hqStatus(page)).data?.missing, { timeout: 30_000 }).toBe(false);
  } finally {
    // Se qualcosa è andato storto la sede di staging torna con indirizzo e coordinate.
    const st = await hqStatus(page).catch(() => null);
    if (st?.data?.missing) {
      await page.goto("/it/user/autoscuole/road");
      const gate = page.getByTestId("road-hq-gate");
      await gate.waitFor({ timeout: 60_000 });
      await page.getByTestId("road-hq-address").fill("Via Roma 42 Milano");
      await gate.locator("button").filter({ hasText: "Via Roma" }).first().click();
      await page.getByTestId("road-hq-save").click();
      await expect(gate).toBeHidden({ timeout: 30_000 });
    }
  }
});

test("foglio della sede a 390 px", async ({ page }) => {
  test.skip(!SHOTS, "solo per le anteprime");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/it/user/autoscuole?tab=settings&pane=locations");
  await page.getByRole("button", { name: "Modifica" }).first().click();
  const precise = page.getByRole("switch", { name: /Posizione precisa/ });
  await expect(precise).toBeVisible({ timeout: 60_000 });
  if ((await precise.getAttribute("aria-checked")) === "true") await precise.click();
  await page.getByRole("button", { name: "Salva luogo" }).click();
  await expect(page.getByRole("button", { name: "Salva luogo" })).toBeHidden({ timeout: 30_000 });
  await page.goto("/it/user/autoscuole/road");
  const gate = page.getByTestId("road-hq-gate");
  await expect(gate).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("road-hq-locate").click();
  await expect(page.getByTestId("road-hq-picked")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await shot(page, "04-web-foglio-sede-390");
  await page.getByRole("button", { name: "Cambia" }).click();
  await page.getByTestId("road-hq-address").fill("Via Roma 42 Milano");
  await gate.locator("button").filter({ hasText: "Via Roma" }).first().click();
  await page.getByTestId("road-hq-save").click();
  await expect(gate).toBeHidden({ timeout: 30_000 });
});
