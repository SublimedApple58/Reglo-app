import { expect, test } from "@playwright/test";

/**
 * REG-642 Reglo Road — aggancio dei percorsi d'esame alle strade (Google Routes,
 * chiamata vera: pochi punti, e la seconda richiesta esce dalla cache) e
 * scorciatoia da una guida Road. Serve Road acceso sull'autoscuola del titolare e2e.
 */

test.setTimeout(120_000);

// Tre punti nel centro di Torino (via Roma → piazza Carlo Felice → corso Vittorio).
const waypoints = [
  [45.0703, 7.6869],
  [45.068, 7.683],
  [45.064, 7.68],
];

const straightMeters = (pts: number[][]) => {
  let m = 0;
  for (let i = 1; i < pts.length; i++) {
    const dLat = (pts[i][0] - pts[i - 1][0]) * 111_320;
    const dLng = (pts[i][1] - pts[i - 1][1]) * 111_320 * Math.cos((pts[i][0] * Math.PI) / 180);
    m += Math.hypot(dLat, dLng);
  }
  return m;
};

test("aggancio alle strade: linea vera, tratti, seconda volta uguale", async ({ page }) => {
  const api = page.request;

  const bad = await (await api.post("/api/autoscuole/road/exam-routes/snap", { data: { waypoints: [waypoints[0]] } })).json();
  expect(bad).toMatchObject({ success: false, code: "INVALID" });

  const first = await (await api.post("/api/autoscuole/road/exam-routes/snap", { data: { waypoints } })).json();
  expect(first.success, first.message).toBe(true);
  expect(first.data.segments).toHaveLength(2);
  expect(first.data.path.length).toBeGreaterThan(waypoints.length);
  // In città la strada è sempre più lunga della linea d'aria.
  expect(first.data.lengthMeters).toBeGreaterThan(straightMeters(waypoints));

  const second = await (await api.post("/api/autoscuole/road/exam-routes/snap", { data: { waypoints } })).json();
  expect(second.data).toEqual(first.data);

  // La linea agganciata si salva così com'è.
  const saved = await (
    await api.post("/api/autoscuole/road/exam-routes", {
      data: { name: `E2E aggancio ${Date.now()}`, waypoints, path: first.data.path },
    })
  ).json();
  expect(saved.success, saved.message).toBe(true);
  expect(saved.data.lengthMeters).toBe(first.data.lengthMeters);
  await api.delete(`/api/autoscuole/road/exam-routes/${saved.data.id}`);
});

test("scorciatoia da guida Road", async ({ page }) => {
  const api = page.request;

  const invalid = await (await api.post("/api/autoscuole/road/exam-routes/from-session", { data: { sessionId: "x" } })).json();
  expect(invalid).toMatchObject({ success: false, code: "INVALID" });
  const missing = await (
    await api.post("/api/autoscuole/road/exam-routes/from-session", {
      data: { sessionId: "00000000-0000-4000-8000-000000000000" },
    })
  ).json();
  expect(missing).toMatchObject({ success: false, code: "NOT_FOUND" });

  const history = await (await api.get("/api/autoscuole/road/history?limit=30")).json();
  expect(history.success).toBe(true);
  const session = history.data.items.find((s: { distanceMeters: number; status: string }) => s.distanceMeters > 300 && s.status !== "active");
  test.skip(!session, "Nessuna guida Road con tracciato in questa autoscuola");

  const draft = await (
    await api.post("/api/autoscuole/road/exam-routes/from-session", { data: { sessionId: session.id } })
  ).json();
  expect(draft.success, draft.message).toBe(true);
  expect(draft.data.sourceSessionId).toBe(session.id);
  expect(draft.data.waypoints.length).toBeGreaterThanOrEqual(2);
  expect(draft.data.waypoints.length).toBeLessThanOrEqual(25);
  expect(draft.data.path.length).toBeGreaterThanOrEqual(2);
  expect(draft.data.lengthMeters).toBeGreaterThan(0);
});
