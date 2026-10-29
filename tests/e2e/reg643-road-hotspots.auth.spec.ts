import { expect, request as pwRequest, test } from "@playwright/test";

/**
 * REG-643 Reglo Road — punti critici (API). Servono Road acceso e i dati di
 * prova di `scripts/seed-road-hotspots.ts` nell'autoscuola del titolare e2e:
 * «Precedenza» in via Roma (6 errori, 3 allievi), «Rotonda» a Porta Nuova
 * (4 errori, 3 allievi), «Stop» in via Po (3 errori di un allievo solo: sotto soglia).
 */

test.setTimeout(120_000);

const PASSWORD = process.env.E2E_PASSWORD || "RegloTest2026!";
const INSTRUCTOR_EMAIL = process.env.E2E_INSTRUCTOR_EMAIL || "istruttore@reglo.it";
const OWNER_COMPANY = "Autoscuola Reglo";

type Hotspot = { key: string; kind: string; errors: number; students: number; examRoutes: Array<{ id: string }> };

test("punti critici: soglia, filtri, dettaglio, percorso d'esame, istruttore", async ({ page, baseURL }) => {
  const api = page.request;

  const list = await (await api.get("/api/autoscuole/road/hotspots")).json();
  expect(list.success, list.message).toBe(true);
  const hs = list.data.hotspots as Hotspot[];
  test.skip(!hs.some((h) => h.kind === "precedenza"), "Mancano i dati di prova (scripts/seed-road-hotspots.ts)");

  const prec = hs.find((h) => h.kind === "precedenza")!;
  expect(prec).toMatchObject({ errors: 6, students: 3 });
  expect(hs.find((h) => h.kind === "rotonda")).toMatchObject({ errors: 4, students: 3 });
  // Un allievo solo non fa un punto critico.
  expect(hs.some((h) => h.kind === "stop")).toBe(false);
  expect(list.data.totalErrors).toBeGreaterThanOrEqual(13);

  const onlyRotonda = await (await api.get("/api/autoscuole/road/hotspots?kind=rotonda")).json();
  expect((onlyRotonda.data.hotspots as Hotspot[]).map((h) => h.kind)).toEqual(["rotonda"]);
  const moto = await (await api.get("/api/autoscuole/road/hotspots?license=A2")).json();
  expect(moto.data.hotspots).toEqual([]);
  const bad = await (await api.get("/api/autoscuole/road/hotspots?from=boh")).json();
  expect(bad).toMatchObject({ success: false, code: "INVALID" });

  const detail = await (await api.get(`/api/autoscuole/road/hotspots/${encodeURIComponent(prec.key)}`)).json();
  expect(detail.success, detail.message).toBe(true);
  expect(detail.data.hotspot.key).toBe(prec.key);
  expect(detail.data.sessions).toHaveLength(5);
  expect(detail.data.students).toHaveLength(3);
  expect(detail.data.hiddenSessions).toBe(0);
  const missing = await (await api.get("/api/autoscuole/road/hotspots/precedenza~10.0000~10.0000")).json();
  expect(missing).toMatchObject({ success: false, code: "NOT_FOUND" });

  // Un percorso d'esame che passa dall'incrocio: il segno compare subito (cache invalidata).
  const route = await (
    await api.post("/api/autoscuole/road/exam-routes", {
      data: {
        name: `E2E punti critici ${Date.now()}`,
        waypoints: [[45.0677, 7.676], [45.0677, 7.69]],
        path: [[45.0677, 7.676], [45.0677, 7.69]],
      },
    })
  ).json();
  expect(route.success, route.message).toBe(true);
  try {
    const withRoute = await (await api.get("/api/autoscuole/road/hotspots")).json();
    const p = (withRoute.data.hotspots as Hotspot[]).find((h) => h.kind === "precedenza")!;
    expect(p.examRoutes.map((r) => r.id)).toContain(route.data.id);
  } finally {
    await api.delete(`/api/autoscuole/road/exam-routes/${route.data.id}`);
  }

  // Istruttore, come dall'app mobile: token + autoscuola scelta con l'header
  // (l'account di test è in due autoscuole; niente select-company, che scrive
  // activeCompanyId sulla fixture condivisa).
  const login = await (
    await api.post("/api/mobile/auth/login", { data: { email: INSTRUCTOR_EMAIL, password: PASSWORD } })
  ).json();
  expect(login.success, login.message).toBe(true);
  const company = (login.data.companies as Array<{ id: string; name: string }>).find((c) => c.name === OWNER_COMPANY);
  test.skip(!company, `L'istruttore di test non è in «${OWNER_COMPANY}»`);
  const ins = await pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { authorization: `Bearer ${login.data.token}`, "x-reglo-company-id": company!.id },
  });
  const insList = await (await ins.get("/api/autoscuole/road/hotspots")).json();
  expect(insList.success, insList.message).toBe(true);
  expect((insList.data.hotspots as Hotspot[]).find((h) => h.kind === "precedenza")).toMatchObject({ errors: 6, students: 3 });
  const insDetail = await (await ins.get(`/api/autoscuole/road/hotspots/${encodeURIComponent(prec.key)}`)).json();
  expect(insDetail.success, insDetail.message).toBe(true);
  expect(insDetail.data.sessions.length + insDetail.data.hiddenSessions).toBe(5);
  expect(insDetail.data.hiddenSessions).toBeGreaterThan(0);
  const names = new Set(insDetail.data.sessions.map((s: { instructor: { name: string } | null }) => s.instructor?.name));
  expect(names.size).toBeLessThanOrEqual(1);
  await ins.dispose();
});
