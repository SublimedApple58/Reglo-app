import fs from "fs";
import path from "path";
import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * REG-458 — il filtro per percorso nel tab Guide, dopo il bug trovato in QA su
 * produzione il 9 ottobre: il tab si presentava etichettato sul percorso
 * VECCHIO invece che su quello in corso, «Mostra tutte» sembrava non fare
 * niente, e il banner compariva anche a chi ha un percorso solo.
 *
 * Fixture su dev — Gabriele Galli (allievo15@reglo.it): AM abbandonata,
 * B conseguita con 2 guide di febbraio/marzo, A in corso con 12 di
 * settembre/ottobre. Matteo Gallo (allievo5@reglo.it): un percorso solo.
 */

const SHOTS = "/tmp/hiro-anteprime/reg-458-fix";

const apri = async (page: Page, nome: string, email: string) => {
  await page.goto("/it/user/autoscuole?tab=students");
  await expect(page.getByTestId("autoscuole-students-page")).toBeVisible({ timeout: 60_000 });

  // La ricerca e' dietro la lente, si apre al click.
  await page.getByRole("button", { name: "Cerca" }).first().click();
  await page.getByPlaceholder("Cerca allievi").fill(nome);

  // «Dettaglio» della RIGA giusta: con .first() si apre il primo allievo della
  // lista, che e' come il test ha mentito al primo giro.
  const riga = page
    .locator("div")
    .filter({ has: page.getByText(email, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Dettaglio" }) })
    .last();
  await riga.getByRole("button", { name: "Dettaglio" }).click();

  // Il drawer e' davvero di questo allievo, e il registro ha finito di caricare.
  await expect(page.getByText(email, { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  await expect(page.getByRole("tab", { name: /^Tutte/ })).toBeVisible({ timeout: 30_000 });
};

/** Ritaglio stretto attorno al banner e ai contatori: non una full-page. */
const scatta = async (page: Page, nome: string, ancora: Locator) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const box = await ancora.boundingBox();
  if (!box) throw new Error(`ancora non visibile per ${nome}`);
  await page.screenshot({
    path: path.join(SHOTS, `${nome}.png`),
    clip: {
      x: Math.max(0, box.x - 20),
      y: Math.max(0, box.y - 20),
      width: box.width + 40,
      height: 250,
    },
  });
};

test("tre percorsi: il tab Guide parte dal percorso IN CORSO", async ({ page }) => {
  await apri(page, "Gabriele Galli", "allievo15@reglo.it");

  const banner = page.getByTestId("lessons-path-banner");
  await expect(banner).toBeVisible();
  // Il bug del 9 ottobre: qui compariva un percorso chiuso, non quello attivo.
  await expect(banner).toContainText("Solo le guide del percorso");
  await expect(banner.locator("span")).toHaveText("A");
  // Le 12 guide del percorso A, non le 14 totali.
  await expect(page.getByRole("tab", { name: /^Tutte/ })).toContainText("12");
  await scatta(page, "01-default-percorso-attivo", banner);

  await banner.getByRole("button", { name: "Mostra tutte" }).click();
  await expect(banner).toContainText("Tutte le guide, di tutti i percorsi");
  // «Mostra tutte» ora si vede che fa qualcosa: 14 invece di 12.
  await expect(page.getByRole("tab", { name: /^Tutte/ })).toContainText("14");
  await scatta(page, "02-mostra-tutte", banner);

  // E si torna indietro senza ripassare dallo storico.
  await banner.getByRole("button", { name: /Solo il percorso A/ }).click();
  await expect(page.getByRole("tab", { name: /^Tutte/ })).toContainText("12");
});

test("un percorso solo: nessun banner, nessun filtro", async ({ page }) => {
  await apri(page, "Matteo Gallo", "allievo5@reglo.it");
  await expect(page.getByTestId("lessons-path-banner")).toHaveCount(0);
  // Ancora sulla barra intera: il singolo tab darebbe un ritaglio di 60px.
  await scatta(page, "03-un-solo-percorso-nessun-banner", page.getByRole("tablist").last());
});
