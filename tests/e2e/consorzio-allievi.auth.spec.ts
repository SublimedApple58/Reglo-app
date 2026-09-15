import { test, expect, type Page } from "@playwright/test";

/**
 * REG-460/464/465 — allievi del consorzio:
 * creazione con soli nome/cognome/telefono, codici contabili collassati,
 * drawer dettaglio allineato a quello delle autoscuole.
 *
 * Gira sull'account consorzio di dev (scripts/seed-consorzio-company.mjs).
 */

const OWNER_EMAIL = "consorzio@reglo.it";
const OWNER_PASSWORD = "Reglo2026!";

async function signInAsConsorzio(page: Page, baseURL?: string) {
  const csrfRes = await page.request.get("/api/auth/csrf");
  expect(csrfRes.ok()).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      callbackUrl: `${baseURL ?? ""}/it/user/autoscuole`,
      json: "true",
    },
  });
}

test("allievo consorzio: creazione minima, codici collassati, drawer a tab", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  await signInAsConsorzio(page, baseURL);

  // Dettaglio della prima autoscuola consorziata
  await page.goto("/it/user/autoscuole?tab=scuole");
  await page.getByText("Autoscuola Robatto").first().click();
  await expect(page.getByRole("heading", { name: /Allievi/ })).toBeVisible({ timeout: 60_000 });

  // ── Dialog "Aggiungi allievo" (REG-460 + REG-464) ──
  await page.getByRole("button", { name: "Aggiungi allievo" }).click();
  const dialog = page.getByTestId("consorzio-student-create");
  await expect(dialog).toBeVisible();

  // I codici contabili NON sono esplosi: la sezione è chiusa col riepilogo.
  await expect(dialog.getByTestId("consorzio-student-codes-list")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /Codici contabili/ })).toBeVisible();

  // Nessuna email/password richiesta a vista: sezione chiusa e facoltativa.
  await expect(dialog.getByLabel("Email", { exact: true })).toHaveCount(0);

  // Il dialog non deborda dalla finestra nemmeno coi codici aperti.
  await dialog.getByRole("button", { name: /Codici contabili/ }).click();
  await expect(dialog.getByTestId("consorzio-student-codes-list")).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box!.height).toBeLessThanOrEqual((viewport?.height ?? 720) * 0.95);

  const surname = `E2E${Date.now().toString().slice(-6)}`;
  await dialog.getByLabel("Nome", { exact: true }).fill("Allievo");
  await dialog.getByLabel("Cognome").fill(surname);
  await dialog.getByLabel("Telefono").fill("3331234567");
  await dialog.getByRole("button", { name: "Aggiungi allievo" }).click();

  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const row = page.getByText(`Allievo ${surname}`).first();
  await expect(row).toBeVisible({ timeout: 30_000 });

  // ── Drawer dettaglio allineato alle autoscuole (REG-465) ──
  // Ricarica per togliere di mezzo il toast di conferma, poi apri il dettaglio.
  await page.reload();
  const rowAfterReload = page.getByText(`Allievo ${surname}`).first();
  await rowAfterReload.scrollIntoViewIfNeeded();
  await rowAfterReload.click();
  const drawer = page.getByTestId("student-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(`Allievo ${surname}`).first()).toBeVisible();

  // Tab Riepilogo: anagrafica + nessuna email finta a schermo + codici contabili
  await expect(drawer.getByText("Anagrafica")).toBeVisible();
  await expect(drawer.getByText("3331234567").first()).toBeVisible();
  await expect(drawer.getByText("Non attivo")).toBeVisible();
  await expect(drawer.getByText(/no-app\.reglo\.local/)).toHaveCount(0);
  await expect(drawer.getByText("Codici contabili")).toBeVisible();

  // Tab Guide e Costi
  await drawer.getByRole("button", { name: "Guide" }).click();
  await expect(drawer.getByText(/Nessuna guida col consorzio/)).toBeVisible();
  await drawer.getByRole("button", { name: "Costi" }).click();
  await expect(drawer.getByTestId("student-cost-total")).toBeVisible();

  // eslint-disable-next-line no-console
  console.log("CONSOLE ERRORS:", JSON.stringify(consoleErrors, null, 2));
});
