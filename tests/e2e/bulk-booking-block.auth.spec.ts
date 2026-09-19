import { test, expect } from "@playwright/test";

/**
 * Blocco prenotazioni in bulk dalla sezione Allievi (REG-442) — e2e lato titolare.
 *
 * Gira loggato come il titolare del seed (titolare@reglo.it). Richiede il seed
 * dev: `pnpm seed:e2e:dev`.
 *
 * Copre il giro completo della UI: checkbox di riga → barra flottante → dialog
 * con "fino a una data" → pill "Bloccato fino al …" sulle righe toccate. Alla
 * fine rimette tutto com'era (sblocco in bulk degli stessi allievi), così il
 * seed resta riutilizzabile.
 */

const STUDENTS_URL = "/it/user/autoscuole/students";

test("blocca e sblocca le prenotazioni di più allievi in un colpo", async ({ page }) => {
  await page.goto(STUDENTS_URL);
  await expect(page.getByTestId("autoscuole-students-page")).toBeVisible({
    timeout: 60_000,
  });

  const rowCheckboxes = page.getByRole("checkbox", { name: /^Seleziona (?!tutti)/ });
  await expect(rowCheckboxes.first()).toBeVisible({ timeout: 30_000 });
  const total = await rowCheckboxes.count();
  test.skip(total < 2, "Servono almeno 2 allievi in Pratica nel seed.");

  // ── Selezione di due allievi ──────────────────────────────────────────
  await rowCheckboxes.nth(0).click();
  await rowCheckboxes.nth(1).click();

  const actionBar = page.getByText("2 allievi selezionati");
  await expect(actionBar).toBeVisible();

  // ── Blocco fino a una data ────────────────────────────────────────────
  await page.getByRole("button", { name: "Blocca prenotazioni" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Blocca prenotazioni")).toBeVisible();

  await dialog.getByText("Fino a una data").click();
  await dialog.getByRole("button", { name: /Scegli la data|\d{2} \w+ \d{4}/ }).click();
  // Primo giorno selezionabile del calendario aperto (mese corrente).
  const today = new Date();
  const targetDay = String(Math.min(today.getDate() + 3, 28));
  await page.getByRole("button", { name: targetDay, exact: true }).last().click();

  await dialog.getByRole("button", { name: /^Blocca 2 allievi$/ }).click();

  await expect(page.getByText(/Prenotazioni bloccate per 2 allievi/).first()).toBeVisible({
    timeout: 30_000,
  });
  // Le righe toccate mostrano la pill "Bloccato" + la scadenza sotto al nome.
  await expect(page.getByText("Bloccato", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/fino al \d{2} \w{3}/).first()).toBeVisible();

  // ── Sblocco degli stessi due, per rimettere il seed com'era ───────────
  await rowCheckboxes.nth(0).click();
  await rowCheckboxes.nth(1).click();
  await expect(page.getByText("2 allievi selezionati")).toBeVisible();
  await page.getByRole("button", { name: "Sblocca" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Riattiva 2 allievi$/ }).click();
  await expect(
    page.getByText(/Prenotazioni riattivate per 2 allievi/).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/fino al \d{2} \w{3}/)).toHaveCount(0);
});
