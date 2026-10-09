import { test, expect } from "@playwright/test";

/**
 * REG-458 — `/api/autoscuole/students` deve esporre `obtainedLicenses`.
 *
 * È l'endpoint che il dettaglio allievo dell'app ISTRUTTORE chiama davvero
 * (`regloApi.getStudents`). Il campo era stato messo su `instructor-settings`,
 * che quella schermata non legge: il tipo mobile lo dichiarava, il backend non
 * lo mandava, e la riga «Già conseguita» è rimasta vuota per tutti dal rilascio
 * dell'8 ottobre fino al 9. Questo test lega il campo all'endpoint giusto.
 */
test("gli allievi portano le patenti già conseguite", async ({ page, baseURL }) => {
  const { csrfToken } = (await (await page.request.get("/api/auth/csrf")).json()) as {
    csrfToken: string;
  };
  await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email: process.env.E2E_OWNER_EMAIL || "titolare@reglo.it",
      password: process.env.E2E_PASSWORD || "RegloTest2026!",
      callbackUrl: `${baseURL ?? ""}/it`,
      json: "true",
    },
  });

  const res = await page.request.get("/api/autoscuole/students?search=Gabriele");
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    success: boolean;
    data: Array<{
      firstName?: string;
      lastName?: string;
      obtainedLicenses?: Array<{ licenseCategory: string | null; obtainedAt: string | null }>;
    }>;
  };
  expect(body.success).toBeTruthy();

  const gabriele = body.data.find((s) => `${s.firstName} ${s.lastName}`.includes("Gabriele"));
  expect(gabriele, "la fixture Gabriele Galli deve esistere su dev").toBeTruthy();
  console.log("obtainedLicenses:", JSON.stringify(gabriele?.obtainedLicenses));

  // Fixture dev: AM abbandonata, B conseguita, A in corso → solo la B.
  expect(gabriele?.obtainedLicenses?.map((o) => o.licenseCategory)).toEqual(["B"]);
  expect(gabriele?.obtainedLicenses?.[0]?.obtainedAt).toBeTruthy();

  // Chi è al primo percorso non porta il campo: il payload non cresce per
  // tutti. Va chiesto l'elenco intero — cercando "Gabriele" torna solo lui,
  // che lo storico ce l'ha.
  const tutti = (await (await page.request.get("/api/autoscuole/students")).json()) as {
    data: Array<{ obtainedLicenses?: unknown[] }>;
  };
  const senzaStorico = tutti.data.filter((s) => s.obtainedLicenses === undefined);
  expect(senzaStorico.length).toBeGreaterThan(0);
  expect(senzaStorico.length).toBeLessThan(tutti.data.length);
});
