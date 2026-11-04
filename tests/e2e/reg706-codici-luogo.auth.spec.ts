import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * REG-706 — codici di invito per luogo nel modale «Chiave di accesso» (Allievi).
 *
 * Con «Disponibilità per luogo» accesa il modale mostra un codice per ogni luogo
 * attivo: nascosto (sei punti) finché non si preme «Mostra», poi lo stesso
 * bottone lo copia. Spenta la funzione la sezione non c'è. Alla fine rimette il
 * setting com'era. I codici dei luoghi, generati alla prima apertura, restano
 * (sono pigri e servono comunque).
 *
 * Tocca setting condivisi con gli spec reg705: `--workers=1`.
 */

test.describe.configure({ timeout: 180_000 });

const CODE = /^[A-Z0-9]{6}$/;

async function json(res: Awaited<ReturnType<APIRequestContext["get"]>>) {
  return (await res.json()) as { success: boolean; data?: unknown; message?: string };
}

async function openDialog(page: Page) {
  await page.goto("/it/user/autoscuole?tab=students");
  const trigger = page.getByTitle("Chiave di accesso");
  await expect(async () => {
    await trigger.click();
    await expect(page.getByTestId("invite-code-dialog")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  return page.getByTestId("invite-code-dialog");
}

test("codici per luogo: nascosti, si mostrano e si copiano; spenti non ci sono", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const settings = (await json(await request.get("/api/autoscuole/settings"))).data as {
    availabilityByLocation?: boolean;
  };
  const locations = ((await json(await request.get("/api/autoscuole/locations"))).data ?? []) as {
    id: string;
    name: string;
  }[];
  test.skip(locations.length < 2, "Servono almeno due luoghi attivi.");

  try {
    await request.patch("/api/autoscuole/settings", { data: { availabilityByLocation: true } });

    const dialog = await openDialog(page);
    const section = dialog.getByTestId("location-invite-codes");
    await expect(section).toBeVisible({ timeout: 30_000 });
    await expect(section.getByText("Codici per luogo")).toBeVisible();
    await expect(section.getByText(`${locations.length} luoghi`)).toBeVisible();
    const rows = section.getByTestId("location-invite-row");
    await expect(rows).toHaveCount(locations.length);

    // Nascosto di default: il codice non è nemmeno nel DOM.
    const first = rows.first();
    const firstName = (await first.locator(".truncate").first().textContent())?.trim() ?? "";
    await expect(first.getByTestId("location-invite-code")).not.toHaveText(CODE);
    const button = first.getByTestId("location-invite-button");
    await expect(button).toHaveAccessibleName(`Mostra il codice di ${firstName}`);

    // Mostra → compare il codice, il bottone diventa «Copia».
    await button.click();
    const codeEl = first.getByTestId("location-invite-code");
    await expect(codeEl).toHaveText(CODE);
    await expect(codeEl).toHaveCSS("opacity", "1");
    await expect(button).toHaveAccessibleName(`Copia il codice di ${firstName}`);
    const code = (await codeEl.textContent())!.trim();

    // Copia → negli appunti, «Copiato» per un attimo e poi di nuovo «Copia».
    await button.click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
    await expect(button.getByText("Copiato")).toHaveCSS("opacity", "1");
    await expect(button.getByText("Copia", { exact: true })).toHaveCSS("opacity", "1", { timeout: 4_000 });

    // Tutti diversi tra loro e dal codice dell'autoscuola.
    const companyCode = (await dialog.getByTestId("invite-code-value").textContent())?.trim();
    const codes: string[] = [];
    for (let i = 0; i < locations.length; i++) {
      const row = rows.nth(i);
      if (i > 0) await row.getByTestId("location-invite-button").click();
      await expect(row.getByTestId("location-invite-code")).toHaveText(CODE);
      codes.push((await row.getByTestId("location-invite-code").textContent())!.trim());
    }
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain(companyCode);

    // L'elenco generale dei luoghi (lo leggono anche istruttori e allievi)
    // non porta mai i codici: escono solo dal modale.
    const listed = ((await json(await request.get("/api/autoscuole/locations"))).data ?? []) as Record<string, unknown>[];
    expect(listed.length).toBeGreaterThan(0);
    for (const loc of listed) expect(loc).not.toHaveProperty("inviteCode");

    // Funzione spenta: la sezione sparisce.
    await page.keyboard.press("Escape");
    await request.patch("/api/autoscuole/settings", { data: { availabilityByLocation: false } });
    const again = await openDialog(page);
    await expect(again.getByText("QR per gli allievi")).toBeVisible();
    await expect(again.getByTestId("location-invite-codes")).toHaveCount(0);
  } finally {
    await request.patch("/api/autoscuole/settings", {
      data: { availabilityByLocation: settings.availabilityByLocation === true },
    });
  }
});
