import { expect, request as pwRequest, test } from "@playwright/test";

/**
 * REG-648 Reglo Road — API del giro (istruttore, come dall'app mobile).
 * Dati di prova di `scripts/seed-road-hotspots.ts` in «Autoscuola Reglo».
 * Sola lettura: nessuna guida né sessione creata. La linea suggerita chiama
 * Google Routes per pochi tratti (poi in cache).
 */

test.setTimeout(120_000);

const PASSWORD = process.env.E2E_PASSWORD || "RegloTest2026!";
const INSTRUCTOR_EMAIL = process.env.E2E_INSTRUCTOR_EMAIL || "istruttore@reglo.it";
const COMPANY = "Autoscuola Reglo";
const START = { lat: 45.0703, lng: 7.6869 };

test("giro: interruttori, proposta, punti dell'allievo, linea suggerita", async ({ page, baseURL }) => {
  // Un allievo con errori ripetuti: dal dettaglio del punto critico «Precedenza».
  const list = await (await page.request.get("/api/autoscuole/road/hotspots")).json();
  expect(list.success, list.message).toBe(true);
  const prec = (list.data.hotspots as Array<{ key: string; kind: string }>).find((h) => h.kind === "precedenza");
  test.skip(!prec, "Mancano i dati di prova (scripts/seed-road-hotspots.ts)");
  const detail = await (await page.request.get(`/api/autoscuole/road/hotspots/${encodeURIComponent(prec!.key)}`)).json();
  const students = detail.data.students as Array<{ id: string }>;

  const login = await (
    await page.request.post("/api/mobile/auth/login", { data: { email: INSTRUCTOR_EMAIL, password: PASSWORD } })
  ).json();
  expect(login.success, login.message).toBe(true);
  const company = (login.data.companies as Array<{ id: string; name: string }>).find((c) => c.name === COMPANY);
  test.skip(!company, `L'istruttore di test non è in «${COMPANY}»`);
  const ins = await pwRequest.newContext({
    baseURL,
    extraHTTPHeaders: { authorization: `Bearer ${login.data.token}`, "x-reglo-company-id": company!.id },
  });

  try {
    const state = await (await ins.get("/api/autoscuole/road/state")).json();
    expect(state.success, state.message).toBe(true);
    expect(state.data).toMatchObject({ planEnabled: true, planAlertsEnabled: true });

    const bad = await (await ins.get(`/api/autoscuole/road/plan?studentId=${students[0].id}&durationMin=5`)).json();
    expect(bad).toMatchObject({ success: false, code: "INVALID" });
    const nobody = await (
      await ins.get("/api/autoscuole/road/plan?studentId=00000000-0000-0000-0000-000000000000&durationMin=60")
    ).json();
    expect(nobody).toMatchObject({ success: false, code: "NOT_FOUND" });

    // Il primo allievo con un giro non vuoto.
    let plan: { stops: Array<Record<string, unknown>>; minutes: number } | null = null;
    let hotspots: unknown[] = [];
    for (const s of students) {
      const res = await (
        await ins.get(`/api/autoscuole/road/plan?studentId=${s.id}&durationMin=60&lat=${START.lat}&lng=${START.lng}`)
      ).json();
      expect(res.success, res.message).toBe(true);
      expect(res.data).toMatchObject({ planEnabled: true, planAlertsEnabled: true });
      if (res.data.plan?.stops.length) {
        plan = res.data.plan;
        hotspots = res.data.studentHotspots;
        break;
      }
    }
    expect(plan, "nessun allievo di prova con un giro").not.toBeNull();
    expect(plan!.stops.length).toBeLessThanOrEqual(3);
    expect(plan!.minutes).toBeLessThanOrEqual(60);
    expect(Array.isArray(hotspots)).toBe(true);
    for (const st of plan!.stops) expect(st).toMatchObject({ key: expect.any(String), title: expect.any(String) });

    const route = await (await ins.post("/api/autoscuole/road/plan/route", { data: { start: START, stops: plan!.stops } })).json();
    expect(route.success, route.message).toBe(true);
    expect(route.data.line?.length ?? 0).toBeGreaterThan(2);
    expect(route.data.lengthMeters).toBeGreaterThan(100);

    const noStart = await (await ins.post("/api/autoscuole/road/plan/route", { data: { stops: plan!.stops } })).json();
    expect(noStart).toMatchObject({ success: false, code: "INVALID" });
  } finally {
    await ins.dispose();
  }
});
