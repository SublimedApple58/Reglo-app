import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Pausa tra una guida e l'altra (REG-484) — e2e lato titolare.
 *
 * Gira loggato come il titolare del seed (titolare@reglo.it). Richiede il seed
 * dev: `pnpm seed:e2e:dev`.
 *
 * Passa dalle API reali (stesse server action della web app e dell'app
 * istruttore) invece di pilotare l'agenda a mano: l'oggetto del test è il
 * comportamento del backend — nasce la pausa? si ferma sull'impegno dopo?
 * scatta l'avviso quando non c'è spazio? — e guidare la griglia oraria
 * aggiungerebbe solo fragilità. Il rendering del blocco «Pausa» è coperto dal
 * test UI in fondo.
 */

const BUFFER_MINUTES = 15;
const BUFFER_REASON = "lesson_buffer";

/** Giorno di lavoro lontano, per non incrociare dati veri o festività vicine. */
const testDay = () => {
  const d = new Date();
  d.setDate(d.getDate() + 45);
  d.setHours(0, 0, 0, 0);
  // Porta a mercoledì: evita weekend e la maggior parte delle festività.
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
  return d;
};

const at = (day: Date, hours: number, minutes: number) => {
  const d = new Date(day);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });

type Json = Record<string, unknown>;

const getSettings = async (api: APIRequestContext) => {
  const res = await api.get("/api/autoscuole/settings");
  expect(res.ok(), "GET /settings").toBeTruthy();
  return ((await res.json()) as { data: Json }).data;
};

const patchSettings = async (api: APIRequestContext, data: Json) => {
  const res = await api.patch("/api/autoscuole/settings", { data });
  expect(res.ok(), `PATCH /settings ${JSON.stringify(data)}`).toBeTruthy();
};

const bufferBlocks = async (api: APIRequestContext, from: Date, to: Date) => {
  const res = await api.get("/api/autoscuole/instructor-blocks", {
    params: {
      reason: BUFFER_REASON,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  });
  expect(res.ok(), "GET /instructor-blocks").toBeTruthy();
  return ((await res.json()) as { data: Array<{ id: string; startsAt: string; endsAt: string }> })
    .data;
};

const bookLesson = async (
  api: APIRequestContext,
  body: {
    studentId: string;
    instructorId: string;
    startsAt: Date;
    endsAt: Date;
    confirmNoBuffer?: boolean;
    allowPast?: boolean;
  },
) =>
  api.post("/api/autoscuole/appointments", {
    data: {
      studentId: body.studentId,
      instructorId: body.instructorId,
      startsAt: body.startsAt.toISOString(),
      endsAt: body.endsAt.toISOString(),
      vehicleId: null,
      type: "guida",
      types: ["guida"],
      ...(body.confirmNoBuffer ? { confirmNoBuffer: true } : {}),
      ...(body.allowPast ? { allowPast: true } : {}),
    },
  });

test.describe("Pausa tra le guide (REG-484)", () => {
  test("nasce dopo la guida, si ferma sull'impegno dopo, e avvisa quando non ci sta @lesson-buffer", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const api = page.request;
    const day = testDay();
    const windowStart = at(day, 8, 0);
    const windowEnd = at(day, 17, 0);

    const original = await getSettings(api);
    const createdAppointments: string[] = [];
    /** Blocchi nati fuori dalla finestra di test (verifica UI su oggi). */
    const uiCleanup: string[] = [];

    try {
      // ── Contesto: chi prenota per chi, e finestra pulita ──────────────────
      const bootstrapRes = await api.get("/api/autoscuole/agenda/bootstrap", {
        params: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
      });
      expect(bootstrapRes.ok(), "GET /agenda/bootstrap").toBeTruthy();
      const bootstrap = ((await bootstrapRes.json()) as {
        data: {
          appointments: Array<{ id: string }>;
          instructors: Array<{ id: string; name: string }>;
          students: Array<{ id: string; email: string | null }>;
          instructorBlocks: Array<{ id: string }>;
        };
      }).data;

      // Dev e staging hanno seed diversi (dev: "Istruttore E2E"; staging:
      // "Chiara Marino"), quindi: nome da env, poi il nome del seed dev, poi
      // il primo istruttore disponibile.
      const instructorName = process.env.E2E_INSTRUCTOR_NAME || "Istruttore E2E";
      const instructor =
        bootstrap.instructors.find((i) => i.name === instructorName) ??
        bootstrap.instructors[0];
      // La directory allievi espone firstName/lastName, non `name`: l'email del
      // seed è l'identificativo stabile.
      const student = bootstrap.students.find((s) => s.email === "allievo@reglo.it");
      expect(instructor, "almeno un istruttore in autoscuola").toBeTruthy();
      expect(student, "allievo del seed (allievo@reglo.it)").toBeTruthy();

      // Residui di run precedenti nella stessa finestra.
      for (const appt of bootstrap.appointments) {
        await api.post(`/api/autoscuole/appointments/${appt.id}/permanent-cancel`);
      }
      for (const block of bootstrap.instructorBlocks) {
        await api.delete(`/api/autoscuole/instructor-blocks/${block.id}`);
      }

      await patchSettings(api, {
        lessonBufferEnabled: true,
        lessonBufferMinutes: BUFFER_MINUTES,
      });

      // ── 1. La guida lascia la sua pausa ───────────────────────────────────
      const aStart = at(day, 10, 0);
      const aEnd = at(day, 11, 0);
      const aRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: aStart,
        endsAt: aEnd,
      });
      expect(aRes.status(), await aRes.text()).toBe(200);
      createdAppointments.push(((await aRes.json()) as { data: { id: string } }).data.id);

      let blocks = await bufferBlocks(api, windowStart, windowEnd);
      expect(blocks).toHaveLength(1);
      expect(hhmm(blocks[0].startsAt)).toBe("11:00");
      expect(hhmm(blocks[0].endsAt)).toBe("11:15");

      // ── 2. Dentro la pausa non si prenota ─────────────────────────────────
      const insideBuffer = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: at(day, 11, 0),
        endsAt: at(day, 11, 30),
      });
      expect(insideBuffer.status()).toBe(400);
      expect(await insideBuffer.text()).toContain("slot bloccato");

      // ── 3. Una guida più in là: anche lei lascia la sua pausa ─────────────
      const cRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: at(day, 12, 15),
        endsAt: at(day, 13, 15),
      });
      expect(cRes.status(), await cRes.text()).toBe(200);
      createdAppointments.push(((await cRes.json()) as { data: { id: string } }).data.id);

      blocks = await bufferBlocks(api, windowStart, windowEnd);
      expect(blocks.map((b) => `${hhmm(b.startsAt)}–${hhmm(b.endsAt)}`)).toEqual([
        "11:00–11:15",
        "13:15–13:30",
      ]);

      // ── 4. La guida che riempie ESATTAMENTE il buco → avviso ──────────────
      // 11:15 (fine pausa di A) → 12:15 (inizio di C): un'ora netta, dopo la
      // quale non resta un minuto per la pausa.
      const bStart = at(day, 11, 15);
      const bEnd = at(day, 12, 15);
      const bRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: bStart,
        endsAt: bEnd,
      });
      expect(bRes.status()).toBe(400);
      const bBody = (await bRes.json()) as { code?: string; message?: string };
      expect(bBody.code).toBe("LESSON_BUFFER_CONFIRM");
      expect(bBody.message).toContain("Non avrai tempo per una pausa");

      // La guida NON è stata creata: l'avviso viene prima di scrivere.
      const afterWarning = await bufferBlocks(api, windowStart, windowEnd);
      expect(afterWarning).toHaveLength(2);

      // ── 5. "Procedi comunque" → la guida nasce, senza pausa ───────────────
      const bConfirmed = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: bStart,
        endsAt: bEnd,
        confirmNoBuffer: true,
      });
      expect(bConfirmed.status(), await bConfirmed.text()).toBe(200);
      createdAppointments.push(
        ((await bConfirmed.json()) as { data: { id: string } }).data.id,
      );

      blocks = await bufferBlocks(api, windowStart, windowEnd);
      expect(
        blocks.map((b) => `${hhmm(b.startsAt)}–${hhmm(b.endsAt)}`),
        "nessuna pausa sopra la guida delle 12:15",
      ).toEqual(["11:00–11:15", "13:15–13:30"]);

      // ── 6. Spazio PARZIALE: avvisa lo stesso, e poi tronca ────────────────
      // 14:00–15:00 con un impegno alle 15:05 lascia 5 minuti: non sono una
      // pausa, quindi l'avviso scatta come per il buco esatto (una regola sola
      // — "la pausa intera non ci sta" — non due casi separati).
      const blockRes = await api.post("/api/autoscuole/instructor-blocks", {
        data: {
          instructorId: instructor!.id,
          startsAt: at(day, 15, 5).toISOString(),
          endsAt: at(day, 16, 0).toISOString(),
          reason: "Impegno E2E",
        },
      });
      expect(blockRes.status(), await blockRes.text()).toBe(200);

      const dWarned = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: at(day, 14, 0),
        endsAt: at(day, 15, 0),
      });
      expect(dWarned.status()).toBe(400);
      expect(((await dWarned.json()) as { code?: string }).code).toBe(
        "LESSON_BUFFER_CONFIRM",
      );

      // Confermando, la guida nasce e la pausa si prende i 5 minuti che ci sono.
      const dRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: at(day, 14, 0),
        endsAt: at(day, 15, 0),
        confirmNoBuffer: true,
      });
      expect(dRes.status(), await dRes.text()).toBe(200);
      createdAppointments.push(((await dRes.json()) as { data: { id: string } }).data.id);

      blocks = await bufferBlocks(api, windowStart, windowEnd);
      expect(
        blocks.map((b) => `${hhmm(b.startsAt)}–${hhmm(b.endsAt)}`),
        "pausa troncata sull'impegno delle 15:05",
      ).toContain("15:00–15:05");

      // ── 7. Il blocco «Pausa» si legge in agenda ───────────────────────────
      // L'agenda apre sempre sulla settimana corrente e non accetta un giorno
      // da querystring, quindi questa verifica usa una guida di OGGI (05:00,
      // ora in cui su dev non c'è mai niente) invece del giorno +45 usato
      // sopra. `allowPast` copre il caso "sono già passate le 5".
      const uiStart = at(new Date(), 5, 0);
      const uiEnd = at(new Date(), 6, 0);
      const uiRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: uiStart,
        endsAt: uiEnd,
        allowPast: true,
      });
      expect(uiRes.status(), await uiRes.text()).toBe(200);
      const uiAppointmentId = ((await uiRes.json()) as { data: { id: string } }).data.id;
      createdAppointments.push(uiAppointmentId);

      const uiBlocks = await bufferBlocks(api, at(new Date(), 4, 0), at(new Date(), 8, 0));
      expect(uiBlocks.map((b) => `${hhmm(b.startsAt)}–${hhmm(b.endsAt)}`)).toContain(
        "06:00–06:15",
      );
      uiCleanup.push(...uiBlocks.map((b) => b.id));

      await page.goto("/it/user/autoscuole?tab=agenda");
      await expect(page.getByTestId("autoscuole-agenda-page").first()).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText("Pausa", { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });

      // ── 8. Setting spento → nessuna pausa nuova ───────────────────────────
      await patchSettings(api, { lessonBufferEnabled: false });
      const before = (await bufferBlocks(api, windowStart, windowEnd)).length;
      const offRes = await bookLesson(api, {
        studentId: student!.id,
        instructorId: instructor!.id,
        startsAt: at(day, 8, 30),
        endsAt: at(day, 9, 30),
      });
      expect(offRes.status(), await offRes.text()).toBe(200);
      createdAppointments.push(((await offRes.json()) as { data: { id: string } }).data.id);
      expect(await bufferBlocks(api, windowStart, windowEnd)).toHaveLength(before);
    } finally {
      // Pulizia: la finestra torna come l'abbiamo trovata.
      for (const id of createdAppointments) {
        await api.post(`/api/autoscuole/appointments/${id}/permanent-cancel`);
      }
      for (const id of uiCleanup) {
        await api.delete(`/api/autoscuole/instructor-blocks/${id}`);
      }
      const leftoverRes = await api.get("/api/autoscuole/instructor-blocks", {
        params: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
      });
      if (leftoverRes.ok()) {
        const leftover = ((await leftoverRes.json()) as { data: Array<{ id: string }> }).data;
        for (const block of leftover) {
          await api.delete(`/api/autoscuole/instructor-blocks/${block.id}`);
        }
      }
      await patchSettings(api, {
        lessonBufferEnabled: original.lessonBufferEnabled === true,
        lessonBufferMinutes:
          typeof original.lessonBufferMinutes === "number"
            ? original.lessonBufferMinutes
            : BUFFER_MINUTES,
      });
    }
  });
});
