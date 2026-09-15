import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * REG-451 — card QR dell'istruttore.
 * 1) Titolare: Impostazioni → Istruttori → Gestisci → Codice → Utilizza: anteprima
 *    verticale/orizzontale, sfondi, Scarica PNG, Stampa.
 * 2) Pagina pubblica /i/<codice> (fallback della fotocamera), valida e non valida.
 * 3) Allievo: anteprima + associazione via API usata dall'app.
 */

const STUDENT_EMAIL = process.env.E2E_STUDENT_EMAIL || "allievo@reglo.it";
const PASSWORD = process.env.E2E_PASSWORD || "RegloTest2026!";

test.describe("Card QR istruttore", () => {
  test("scheda Codice, anteprima, PNG, stampa, fallback web e associazione @qr", async ({ page, context, baseURL }) => {
    test.setTimeout(240_000);

    await page.goto("/it/user/autoscuole?tab=settings&pane=instructors");
    const codiceTab = page.getByTestId("instructor-codice-tab");
    // La scheda Codice esiste solo per gli istruttori in gestione autonoma.
    const gestisci = page.getByRole("button", { name: "Gestisci" });
    await expect(gestisci.first()).toBeVisible({ timeout: 120_000 });
    const count = await gestisci.count();
    let withCodice = 0;
    let withoutCodice = 0;
    for (let i = 0; i < count; i++) {
      await gestisci.nth(i).click();
      await expect(page.getByRole("button", { name: "Disponibilità", exact: true })).toBeVisible({ timeout: 30_000 });
      if (await page.getByRole("button", { name: "Codice", exact: true }).count()) {
        withCodice++;
        break;
      }
      withoutCodice++;
      await page.getByTestId("instructors-pane").getByRole("button", { name: "Istruttori" }).click();
    }
    expect(withCodice, "serve almeno un istruttore in gestione autonoma").toBe(1);
    console.log(`istruttori senza scheda Codice prima di quello autonomo: ${withoutCodice}`);
    await page.getByRole("button", { name: "Codice", exact: true }).click();
    await expect(codiceTab).toBeVisible();

    // Chiave dell'istruttore + Copia.
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const keyValue = codiceTab.getByTestId("instructor-key-value");
    await expect(keyValue).toHaveText(/^[A-Z0-9]{6}$/, { timeout: 30_000 });
    await codiceTab.getByRole("button", { name: "Copia" }).click();
    await expect(codiceTab.getByRole("button", { name: "Copiato ✓" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe((await keyValue.textContent())?.trim());

    await expect(codiceTab.getByText("Card QR da stampare")).toBeVisible();
    await expect(codiceTab.getByText("Lo scotch non è incluso")).toBeVisible();
    await expect(codiceTab.getByRole("link", { name: /Cerca una tasca adesiva su Amazon/ })).toHaveAttribute(
      "href",
      /amazon\.it/,
    );

    await codiceTab.getByRole("button", { name: "Utilizza" }).click();
    const dialog = page.getByTestId("qr-card-dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText(/^Card QR — /)).toBeVisible();

    // Verticale di default, con QR e codice.
    const vert = dialog.getByTestId("qr-card-vert");
    await expect(vert).toBeVisible();
    await expect(vert.locator("svg").first()).toBeVisible();
    const code = (await vert.locator("div.tracking-\\[2\\.6px\\]").textContent())?.trim() ?? "";
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Sfondo: cambia la didascalia del film.
    await expect(dialog.getByText("Goldfinger · 1964")).toBeVisible();
    await dialog.getByRole("button", { name: "Scarface · 1983" }).click();
    await expect(dialog.getByText("Scarface · 1983")).toBeVisible();

    // Orizzontale.
    await dialog.getByRole("button", { name: "Orizzontale" }).click();
    await expect(dialog.getByTestId("qr-card-horiz")).toBeVisible();
    await expect(vert).toBeHidden();

    // Scarica PNG: A4 con nome del prototipo.
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await dialog.getByRole("button", { name: "Scarica PNG" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^Reglo - QR .+\.png$/);
    const png = await download.createReadStream().then(
      (s) =>
        new Promise<Buffer>((ok) => {
          const chunks: Buffer[] = [];
          s.on("data", (c: Buffer) => chunks.push(c));
          s.on("end", () => ok(Buffer.concat(chunks)));
        }),
    );
    // Header PNG + dimensioni 1588×2246 (794×1123 @2x).
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1588);
    expect(png.readUInt32BE(20)).toBe(2246);
    await expect(dialog.getByRole("button", { name: /Scaricato ✓|Scarica PNG/ })).toBeVisible();

    // Stampa: prepara il foglio A4 e chiama window.print.
    await page.evaluate(() => {
      (window as unknown as { __printed: number }).__printed = 0;
      window.print = () => {
        (window as unknown as { __printed: number }).__printed++;
      };
    });
    await dialog.getByRole("button", { name: "Stampa" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
    await expect(page.locator("#__print-sheet [data-testid='qr-card-horiz']")).toHaveCount(1);
    await expect(page.locator("#__print-sheet").getByText("taglia qui")).toHaveCount(2);
    // Chrome stampa senza "Grafica in background" di default: il foglio forza
    // i colori di sfondo, altrimenti la card esce bianca (bug stampa REG-451).
    await page.emulateMedia({ media: "print" });
    const printAdjust = await page.evaluate(() => {
      const card = document.querySelector("#__print-sheet [data-testid='qr-card-horiz']") as HTMLElement;
      const cs = getComputedStyle(card) as CSSStyleDeclaration & { webkitPrintColorAdjust?: string };
      return cs.printColorAdjust || cs.webkitPrintColorAdjust;
    });
    expect(printAdjust).toBe("exact");
    await page.emulateMedia({ media: "screen" });

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // Fallback web aperto dalla fotocamera (anche senza sessione).
    const anon = await context.browser()!.newContext({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
    });
    const phone = await anon.newPage();
    await phone.goto(`${baseURL}/i/${code}`);
    await expect(phone.getByTestId("instructor-link-landing")).toBeVisible({ timeout: 60_000 });
    await expect(phone.getByTestId("instructor-link-open-app")).toHaveAttribute(
      "href",
      `com.tiziano.developer.reglo-mobile://associa-istruttore?code=${code}`,
    );
    await expect(phone.getByRole("link", { name: /App Store/ })).toBeVisible();
    await phone.goto(`${baseURL}/i/ZZ0ZZ0`);
    await expect(phone.getByTestId("instructor-link-invalid")).toBeVisible();
    await anon.close();

    // Allievo: anteprima e associazione con la stessa API dell'app.
    const api = await pwRequest.newContext({ baseURL });
    const { csrfToken } = (await (await api.get("/api/auth/csrf")).json()) as { csrfToken: string };
    await api.post("/api/auth/callback/credentials", {
      form: { csrfToken, email: STUDENT_EMAIL, password: PASSWORD, callbackUrl: `${baseURL}/`, json: "true" },
    });

    const invalid = await (await api.get("/api/autoscuole/me/instructor-link?code=ZZ0ZZ0")).json();
    expect(invalid).toMatchObject({ success: true, data: { status: "invalid" } });

    const preview = await (
      await api.get(`/api/autoscuole/me/instructor-link?code=${encodeURIComponent(`${baseURL}/i/${code}`)}`)
    ).json();
    expect(preview.success).toBe(true);
    expect(preview.data.status).toBe("ok");
    expect(preview.data.code).toBe(code);

    const linked = await (await api.post("/api/autoscuole/me/instructor-link", { data: { code } })).json();
    expect(linked).toMatchObject({ success: true, data: { status: "linked" } });

    const after = await (await api.get(`/api/autoscuole/me/instructor-link?code=${code}`)).json();
    expect(after.data).toMatchObject({ status: "ok", alreadyLinked: true, currentInstructor: null });
    await api.dispose();
  });
});
