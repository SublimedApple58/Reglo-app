import { test, expect, type Page } from "@playwright/test";
import { NEWS_SEEN_KEYS } from "./news-seen";

/**
 * REG-466 — stato client al primo render dopo il login.
 *
 * Il login è una server action che fa un redirect, quindi i provider montati
 * sopra la rotta (SessionProvider di next-auth e store jotai) non si rimontano:
 * prima del fix l'hamburger non compariva finché non si ricaricava la pagina e
 * un account consorzio, entrando subito dopo un account autoscuola, si vedeva
 * l'interfaccia autoscuola. Lo store jotai era per di più uno solo per processo
 * lato server, quindi l'HTML servito era quello dell'azienda della prima
 * richiesta. Qui si verifica il comportamento SENZA mai ricaricare.
 */

const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL || "titolare@reglo.it";
const OWNER_PASSWORD = process.env.E2E_PASSWORD || "RegloTest2026!";
const CONSORZIO_EMAIL = process.env.E2E_CONSORZIO_EMAIL || "consorzio@reglo.it";
const CONSORZIO_PASSWORD = process.env.E2E_CONSORZIO_PASSWORD || "Reglo2026!";

const APP_PATH = "/it/user/autoscuole";
const SIGN_IN = `/it/sign-in?callbackUrl=${encodeURIComponent(APP_PATH)}`;

const signIn = async (page: Page, email: string, password: string) => {
  await page.goto(SIGN_IN);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Accedi" }).click();
  await page.waitForURL((url) => !url.pathname.includes("sign-in"), {
    timeout: 90_000,
  });
};

const signOut = async (page: Page) => {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByText("Esci", { exact: true }).first().click();
  await page.waitForURL((url) => url.pathname.includes("sign-in"), {
    timeout: 60_000,
  });
};

test.beforeEach(async ({ context }) => {
  // Le news "una volta per dispositivo" coprono la pagina con un dialog modale.
  await context.addInitScript((keys: string[]) => {
    keys.forEach((key) => {
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* storage non disponibile */
      }
    });
  }, NEWS_SEEN_KEYS);
});

test("l'hamburger c'è già al primo accesso, senza ricaricare", async ({ page }) => {
  await signIn(page, OWNER_EMAIL, OWNER_PASSWORD);

  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible({
    timeout: 30_000,
  });
  // e apre davvero il menu (la sessione lato client c'è, non è solo disegnato)
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByText("Area personale")).toBeVisible();
});

test("un account consorzio dopo un account autoscuola vede subito la sua interfaccia", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("pageerror", (error) => {
    if (/hydrat/i.test(String(error))) hydrationErrors.push(String(error));
  });

  await signIn(page, OWNER_EMAIL, OWNER_PASSWORD);
  await expect(page.getByRole("link", { name: "Allievi" })).toBeVisible({
    timeout: 30_000,
  });

  await signOut(page);
  await signIn(page, CONSORZIO_EMAIL, CONSORZIO_PASSWORD);

  // Nessun reload qui in mezzo: è esattamente il caso segnalato.
  await expect(page.getByRole("link", { name: "Autoscuole" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("link", { name: "Fatturazione" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Allievi" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();

  expect(hydrationErrors, hydrationErrors.join("\n")).toHaveLength(0);
});
