import { test, expect } from "@playwright/test";

/**
 * REG-458 — `/api/autoscuole/me` deve esporre TUTTI i percorsi patente, non
 * solo quelli conseguiti: e' il dato con cui l'app decide quali guide sono del
 * percorso in corso e quali di quelli precedenti. Senza, "Le tue guide" torna a
 * mescolarli (bug del 2026-10-09, lato mobile).
 */
test("l'allievo riceve i suoi percorsi patente", async ({ page, baseURL }) => {
  const email = process.env.E2E_STUDENT_EMAIL || "allievo15@reglo.it";
  const password = process.env.E2E_PASSWORD || "RegloTest2026!";

  const { csrfToken } = (await (await page.request.get("/api/auth/csrf")).json()) as {
    csrfToken: string;
  };
  await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email, password, callbackUrl: `${baseURL ?? ""}/it`, json: "true" },
  });

  const res = await page.request.get("/api/autoscuole/me");
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as {
    success: boolean;
    data: {
      licensePaths?: Array<{ id: string; licenseCategory: string | null; status: string; startedAt: string }>;
      obtainedLicenses?: Array<{ licenseCategory: string | null }>;
    };
  };
  expect(body.success).toBeTruthy();

  const paths = body.data.licensePaths ?? [];
  console.log("percorsi:", JSON.stringify(paths, null, 2));
  console.log("conseguite:", JSON.stringify(body.data.obtainedLicenses));

  // La fixture dev: AM abbandonata, B conseguita, A in corso — dal piu' vecchio.
  expect(paths.length).toBeGreaterThan(1);
  expect(paths.map((p) => p.licenseCategory)).toEqual(["AM", "B", "A"]);
  expect(paths.map((p) => p.status)).toEqual(["abandoned", "obtained", "active"]);
  // `obtainedLicenses` resta quello che la 2.3.0 gia' sul campo si aspetta.
  expect(body.data.obtainedLicenses?.map((o) => o.licenseCategory)).toEqual(["B"]);
});
