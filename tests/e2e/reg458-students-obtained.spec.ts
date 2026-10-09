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

  const res = await page.request.get("/api/autoscuole/students");
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
  expect(body.data.length).toBeGreaterThan(0);

  // Volutamente indipendente dai dati: dev e staging hanno allievi diversi, e
  // legare il test a un nome lo rende verde dove la fixture esiste e cieco
  // altrove — che e' esattamente come questo bug e' arrivato in produzione.
  const conStorico = body.data.filter((s) => s.obtainedLicenses !== undefined);
  const senzaStorico = body.data.filter((s) => s.obtainedLicenses === undefined);

  console.log(
    `allievi: ${body.data.length}, con storico: ${conStorico.length}`,
    JSON.stringify(conStorico[0]?.obtainedLicenses),
  );

  // Almeno un allievo deve portarlo: se nessuno lo porta, il campo non sta
  // uscendo dall'endpoint ed e' di nuovo il bug di prima.
  expect(conStorico.length).toBeGreaterThan(0);
  for (const student of conStorico) {
    expect(student.obtainedLicenses!.length).toBeGreaterThan(0);
    for (const licenza of student.obtainedLicenses!) {
      expect(licenza.licenseCategory).toBeTruthy();
    }
  }

  // E chi e' al primo percorso NON lo porta: il payload non cresce per tutti.
  expect(senzaStorico.length).toBeGreaterThan(0);
});
