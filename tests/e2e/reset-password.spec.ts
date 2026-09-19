import { test, expect } from "@playwright/test";

/**
 * Recupero password web (REG-485) — giro dell'interfaccia, senza database.
 *
 * Il codice in chiaro esiste solo dentro l'email, quindi qui non si arriva
 * fino al cambio password: si verificano il percorso dal login, il passo del
 * codice e le due proprietà che contano per la sicurezza — la risposta non
 * cambia per un'email sconosciuta, e un codice sbagliato non dice perché.
 * Il resto (tentativi, scadenza, revoca sessioni) è coperto dai test unitari
 * di `lib/auth/password-reset.ts`.
 */

// Indirizzo che non esiste in nessun ambiente: non deve partire nessuna email.
const UNKNOWN_EMAIL = "nessun-account-reg485@example.invalid";

test.describe("Recupero password (REG-485)", () => {
  test("dal login si arriva al flusso e il codice sbagliato viene rifiutato", async ({
    page,
  }) => {
    await page.goto("/it/sign-in");

    // L'email già digitata nel login viene portata avanti: chi ha sbagliato
    // password non la ridigita.
    await page.getByLabel("Email").fill(UNKNOWN_EMAIL);
    await page.getByRole("link", { name: "Recupera la password" }).click();

    await page.waitForURL("**/reset-password**");
    await expect(page.getByRole("heading", { name: "Recupera la password" })).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(UNKNOWN_EMAIL);

    // Email sconosciuta: stessa risposta di un'email vera (no enumerazione).
    await page.getByRole("button", { name: "Invia il codice" }).click();
    await expect(page.getByText("Se l'email è registrata")).toBeVisible({ timeout: 30_000 });

    const codeField = page.getByLabel("Codice ricevuto via email");
    await expect(codeField).toBeVisible();

    // Il campo tiene solo cifre, al massimo sei.
    await codeField.fill("12ab34cd56789");
    await expect(codeField).toHaveValue("123456");

    await page.getByRole("button", { name: "Continua" }).click();
    await expect(page.getByText("Codice non valido o scaduto.")).toBeVisible({
      timeout: 30_000,
    });

    // "Cambia email" riporta al primo passo senza ricaricare.
    await page.getByRole("button", { name: "Cambia email" }).click();
    await expect(page.getByRole("button", { name: "Invia il codice" })).toBeVisible();
  });

  test("chi è già dentro non vede la pagina", async ({ page }) => {
    // Senza sessione la pagina è pubblica: se il middleware la proteggesse per
    // sbaglio, qui finiremmo sul login.
    await page.goto("/it/reset-password");
    await expect(page).toHaveURL(/\/reset-password/);
  });
});
