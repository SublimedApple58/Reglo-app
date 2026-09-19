import { test, expect, type Page } from "@playwright/test";

/**
 * REG-487 — le pagine pubbliche di accesso sono una pagina sola.
 *
 * Login, registrazione e recupero password condividono guscio, foto e pezzi di
 * form (`auth-shell.tsx`, `auth-form-ui.tsx`). Prima /sign-up viveva in un
 * route group suo con un pannello nero e un carosello 3D: due pagine che
 * sembravano due prodotti diversi. Qui si verifica che non torni a succedere.
 */

const HERO = 'img[src*="login-hero"]';

const heroBox = async (page: Page) => {
  const hero = page.locator(HERO);
  await expect(hero).toBeVisible();
  return (await hero.boundingBox())!;
};

test.use({ viewport: { width: 1440, height: 900 } });

test.describe("Pagine di accesso (REG-487)", () => {
  test("login e registrazione mostrano la stessa foto, nella stessa posizione", async ({
    page,
  }) => {
    await page.goto("/it/sign-in");
    const login = await heroBox(page);
    await expect(page.getByText("Titolare di autoscuola")).toBeVisible();

    await page.goto("/it/sign-up");
    const signUp = await heroBox(page);
    await expect(page.getByText("Titolare di autoscuola")).toBeVisible();

    expect(signUp).toEqual(login);
  });

  test("il recupero password usa lo stesso guscio", async ({ page }) => {
    await page.goto("/it/sign-in");
    const login = await heroBox(page);

    await page.goto("/it/reset-password");
    expect(await heroBox(page)).toEqual(login);
  });

  test("la registrazione ha i campi del design condiviso e rimanda al login", async ({
    page,
  }) => {
    await page.goto("/it/sign-up");

    await expect(page.getByRole("heading", { name: "Crea il tuo account" })).toBeVisible();
    // Le due password hanno l'occhio mostra/nascondi come nel login, e
    // etichette che non sono una la sottostringa dell'altra.
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Ripeti la password")).toBeVisible();
    await expect(page.getByLabel("Mostra i caratteri")).toHaveCount(2);

    await page.getByRole("link", { name: "Accedi" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
