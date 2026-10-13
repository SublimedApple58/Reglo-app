import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * REG-608 — «Auto al seguito occupata» nella prenotazione multipla.
 *
 * Gira loggato come il titolare del seed. Richiede i dati di prova:
 *   pnpm seed:e2e:dev
 *   DOTENV_CONFIG_PATH=.env.dev NODE_OPTIONS=--require=dotenv/config \
 *     npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-reg608.ts
 *
 * Oltre a verificare il flusso, fotografa la schermata nei tre stati veri
 * (conflitti misti, una stessa auto libera per tutte, nessuna auto libera) e
 * il messaggio di conflitto che nomina il mezzo.
 */

const OUT = "/tmp/hiro-anteprime/reg-608";
const STUDENT = "Marta Moto REG608";
const MOTO = "HONDA 500 REG608";
const FOLLOW_CAR = "POLO BLU REG608";

/** Lo stesso lunedì fra cinque settimane che usa lo script dei dati di prova. */
const baseDay = () => {
  const d = new Date();
  d.setDate(d.getDate() + 35);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7));
  return d;
};
const day = (offset: number) => {
  const d = baseDay();
  d.setDate(d.getDate() + offset);
  return d;
};

const popover = (page: Page) => page.getByRole("dialog", { name: /Nuovo appuntamento|Auto al seguito occupata/ });
/** L'ultimo popover Radix aperto: calendario, orologio o menu di una Select. */
const lastPopper = (page: Page) => page.locator("[data-radix-popper-content-wrapper]").last();

/** Il popover ha una pill "Altri campi" incollata in basso che intercetta i click: si lavora al centro. */
const center = async (locator: Locator) => {
  await locator.evaluate((el) => el.scrollIntoView({ block: "center" }));
};

const pickDate = async (page: Page, trigger: Locator, target: Date) => {
  await center(trigger);
  await trigger.click();
  const pop = lastPopper(page);
  const wanted = target
    .toLocaleDateString("it-IT", { month: "long", year: "numeric" })
    .toLowerCase();
  for (let i = 0; i < 18; i += 1) {
    const label = (await pop.locator("span").first().innerText()).trim().toLowerCase();
    if (label === wanted) break;
    await pop.getByLabel("Mese successivo").click();
    await page.waitForTimeout(80);
  }
  await pop.getByRole("button", { name: String(target.getDate()), exact: true }).click();
};

const pickTime = async (page: Page, trigger: Locator, hhmm: string) => {
  await center(trigger);
  await trigger.click();
  const pop = lastPopper(page);
  const columns = pop.locator("div.overflow-y-auto");
  const [hour, minute] = hhmm.split(":");
  await columns.nth(0).getByRole("button", { name: hour, exact: true }).click();
  await columns.nth(1).getByRole("button", { name: minute, exact: true }).click();
  // NON Escape: il popover della card lo intercetta e si chiude tutto (il suo
  // handler non vede piu' l'orologio, che Radix ha gia' smontato). Si clicca
  // un'etichetta inerte: chiude solo l'orologio e committa l'orario. Mai la
  // riga "Prenotazione multipla", che e' cliccabile e spegnerebbe la lista.
  await popover(page).getByText("Modalità", { exact: true }).click();
  await page.waitForTimeout(150);
};

/** Apre il form, modalità moto, allievo+moto+auto al seguito già scelti. */
const openMotoForm = async (page: Page) => {
  await page.goto("/it/user/autoscuole?tab=agenda");
  await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible({ timeout: 60_000 });
  // Il menu "+" a volte non si apre al primo click (pagina ancora in idratazione):
  // si riprova invece di far cadere il test.
  const newAppointment = page.getByRole("button", { name: "Appuntamento" }).first();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.getByTitle("Inserisci a mano").click();
    try {
      await newAppointment.waitFor({ state: "visible", timeout: 4_000 });
      break;
    } catch {
      await page.waitForTimeout(500);
    }
  }
  await newAppointment.click();
  const card = popover(page);
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: /^Moto/ }).first().click();
  await card.getByPlaceholder("Cerca allievo...").fill("Marta");
  await page.getByText(new RegExp(STUDENT)).last().click();
  await page.waitForTimeout(300);

  // L'allievo di prova non ha un istruttore assegnato: va scelto a mano.
  await card.getByRole("combobox", { name: "Istruttore" }).click();
  await page.getByRole("option", { name: "Istruttore E2E" }).click();

  await card.getByRole("combobox", { name: "Moto" }).click();
  await page.getByRole("option", { name: new RegExp(MOTO) }).click();

  await card.getByRole("combobox", { name: "Auto al seguito" }).click();
  await page.getByRole("option", { name: new RegExp(FOLLOW_CAR) }).click();
  return card;
};

/** Mette in lista le guide richieste (giorno + ora) e preme Crea. */
const fillSlotsAndSubmit = async (
  page: Page,
  card: Locator,
  slots: Array<{ date: Date; time: string }>,
) => {
  await card.getByText("Più guide in una volta sola").click();
  for (let i = 1; i < slots.length; i += 1) {
    await card.getByRole("button", { name: "Aggiungi guida" }).click();
  }
  for (const [index, slot] of slots.entries()) {
    const row = card.getByTestId("multi-entry").nth(index);
    await pickDate(page, row.getByRole("button").first(), slot.date);
    await pickTime(page, row.getByRole("button").nth(1), slot.time);
  }
  await card.getByRole("button", { name: new RegExp(`Crea ${slots.length} guid`) }).click();
};

const shoot = async (card: Locator, file: string) => {
  // La card ha un corpo scrollabile: si riporta in cima, altrimenti la foto
  // taglia il riepilogo e la prima riga.
  await card.locator("div.overflow-y-auto").first().evaluate((el) => el.scrollTo({ top: 0 }));
  await card.page().waitForTimeout(250);
  await card.screenshot({ path: `${OUT}/${file}` });
  console.log("HIRO_SHOT", `${OUT}/${file}`);
};

// Schermo da portatile vero: la card deve starci tutta senza scorrere.
test.use({ viewport: { width: 1440, height: 1000 } });

test.describe("REG-608 — auto al seguito occupata", () => {
  test("conflitti misti: due date si risolvono da sole, una resta da scegliere", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await openMotoForm(page);
    // Scritte APPOSTA fuori ordine: a schermo devono leggersi in ordine di orario.
    await fillSlotsAndSubmit(page, card, [
      { date: day(0), time: "09:00" },
      { date: day(0), time: "15:00" },
      { date: day(0), time: "11:00" },
    ]);
    await expect(card.getByText("Auto al seguito occupata")).toBeVisible({ timeout: 30_000 });
    const orari = await card.getByText(/·\s\d{2}:\d{2} – \d{2}:\d{2}$/).allInnerTexts();
    expect(orari.map((t) => t.slice(-13, -8))).toEqual(["09:00", "11:00", "15:00"]);
    // Due date si risolvono da sole (un'auto libera sola non e' una scelta),
    // una resta da scegliere.
    await expect(card.getByText(new RegExp(`${FOLLOW_CAR} è già impegnata`)).first()).toBeVisible();
    await expect(card.getByRole("combobox", { name: "Auto al seguito" })).toHaveCount(3);
    await page.waitForTimeout(400);
    await shoot(card, "vera-01-tre-date-in-conflitto.png");
  });

  test("una stessa auto libera in tutte le date: si risolve con un clic", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await openMotoForm(page);
    await fillSlotsAndSubmit(page, card, [
      { date: day(0), time: "11:00" },
      { date: day(1), time: "09:00" },
      { date: day(1), time: "11:00" },
    ]);
    await expect(card.getByText("Auto al seguito occupata")).toBeVisible({ timeout: 30_000 });
    await expect(card.getByRole("button", { name: "Applica a tutte" })).toBeVisible();
    await page.waitForTimeout(400);
    await shoot(card, "vera-02-usa-la-stessa-auto-per-tutte.png");
  });

  test("nessuna auto libera, e un conflitto che cambiare auto non risolve", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await openMotoForm(page);
    await fillSlotsAndSubmit(page, card, [
      { date: day(0), time: "17:00" },
      { date: day(1), time: "17:00" },
    ]);
    await expect(card.getByText("Auto al seguito occupata")).toBeVisible({ timeout: 30_000 });
    await expect(card.getByText("Nessuna auto libera a quest'ora")).toBeVisible();
    await expect(card.getByRole("button", { name: "Togli la guida" }).first()).toBeVisible();
    await page.waitForTimeout(400);
    await shoot(card, "vera-03-nessuna-auto-libera.png");
  });

  /**
   * Il giro completo, fino alle guide create davvero (REG-616).
   *
   * E' il passo che mancava: i test sopra si fermano alla schermata di
   * riparazione, e il difetto viveva proprio dopo — scelta l'auto sostitutiva,
   * la creazione rispondeva "l'istruttore ha gia' un impegno" su un istruttore
   * libero, perche' il controllo prendeva per buona la riga di un collega che
   * con quella data non c'entrava piu'.
   *
   * ⚠️ Questo test OCCUPA gli slot: per ripeterlo rilancia `scripts/seed-reg608.ts`
   * (che ora ripulisce anche le guide dell'allievo di prova).
   */
  test("scelta l'auto sostitutiva, le guide si creano davvero", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await openMotoForm(page);
    await fillSlotsAndSubmit(page, card, [
      { date: day(1), time: "09:00" },
      { date: day(1), time: "11:00" },
    ]);
    await expect(card.getByText("Auto al seguito occupata")).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Applica a tutte" }).click();
    await card.getByRole("button", { name: /^Crea 2 guide$/ }).click();
    await expect(page.getByText("2 guide prenotate.")).toBeVisible({ timeout: 30_000 });
    // La card si chiude: non e' rimasto niente da sistemare.
    await expect(card.getByText("Auto al seguito occupata")).toHaveCount(0);
  });

  test("guida singola: il messaggio dice QUALE auto è occupata", async ({ page }) => {
    test.setTimeout(180_000);
    const card = await openMotoForm(page);
    await pickDate(page, card.getByRole("button").filter({ hasText: /\d{1,2}\s/ }).first(), day(0));
    await pickTime(page, card.getByRole("button").filter({ hasText: /^\d{2}:\d{2}$/ }).first(), "09:00");
    await card.getByRole("button", { name: "Crea guida" }).click();
    const toast = page.getByText(new RegExp(`auto al seguito ${FOLLOW_CAR} è già impegnata`, "i"));
    await expect(toast.first()).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(300);
    const box = toast.first().locator("xpath=ancestor::*[self::li or self::div][3]");
    await box.screenshot({ path: `${OUT}/vera-04-messaggio-conflitto.png` });
    console.log("HIRO_SHOT", `${OUT}/vera-04-messaggio-conflitto.png`);
  });
});
