import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * «Invita allievi idonei» — REG-617.
 *
 * Il difetto segnalato: l'app mostrava «Errore — Aborted» su un invito che era
 * andato a buon fine. La riga d'invito si crea PRIMA delle notifiche, e la
 * cascata di push/email in serie — su un'autoscuola vera, centinaia di
 * destinatari — superava i 15 secondi del timeout del client. Il fix sposta gli
 * invii dopo la risposta (`after()`), quindi questo giro verifica le due cose
 * che l'app vede davvero: la chiamata **torna presto** e dice **a quanti**.
 *
 * Gira loggato come il titolare del seed (`titolare@reglo.it`). Richiede il
 * seed: `pnpm seed:e2e:dev` (o `:staging`).
 */

/** Il timeout del client mobile: il numero che il difetto faceva sforare. */
const MOBILE_CLIENT_TIMEOUT_MS = 15_000;

type Invitee = { id: string; name: string | null };

/** Giorno di lavoro lontano, per non incrociare dati veri né altri test. */
const testDay = () => {
  const d = new Date();
  d.setDate(d.getDate() + 53);
  d.setHours(0, 0, 0, 0);
  // Porta a mercoledì: fuori dal weekend e dalle finestre degli altri spec.
  d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7));
  return d;
};

const at = (day: Date, hours: number) => {
  const d = new Date(day);
  d.setHours(hours, 0, 0, 0);
  return d;
};

const bootstrap = async (api: APIRequestContext, from: Date, to: Date) => {
  const res = await api.get("/api/autoscuole/agenda/bootstrap", {
    params: { from: from.toISOString(), to: to.toISOString() },
  });
  expect(res.ok(), "GET /agenda/bootstrap").toBeTruthy();
  return (await res.json()) as {
    data: {
      appointments: Array<{ id: string; groupLessonId: string | null }>;
      instructors: Array<{ id: string; name: string }>;
      vehicles: Array<{
        id: string;
        licenseCategory: string | null;
        status?: string | null;
        assignedInstructorId?: string | null;
      }>;
    };
  };
};

test.describe("Invito a una guida di gruppo (REG-617)", () => {
  test("l'invito torna subito e dice a quanti allievi è andato @reg617", async ({ page }) => {
    test.setTimeout(180_000);
    const api = page.request;
    const day = testDay();
    const windowStart = at(day, 8);
    const windowEnd = at(day, 20);

    const created: string[] = [];

    try {
      const boot = await bootstrap(api, windowStart, windowEnd);
      const instructor = boot.data.instructors[0];
      expect(instructor, "almeno un istruttore in autoscuola").toBeTruthy();

      // Veicolo senza istruttore assegnato: il test non dipende da come è
      // configurata l'esclusività nel seed.
      const car = boot.data.vehicles.find(
        (v) =>
          v.licenseCategory === "B" &&
          (v.status ?? "active") === "active" &&
          !v.assignedInstructorId,
      );
      expect(car, "un'auto di categoria B libera da esclusività").toBeTruthy();

      // Residui di run precedenti nella finestra.
      for (const row of boot.data.appointments) {
        if (row.groupLessonId) {
          await api.delete(`/api/autoscuole/group-lessons/${row.groupLessonId}`);
        }
        if (!row.id.startsWith("gl-empty:")) {
          await api.post(`/api/autoscuole/appointments/${row.id}/permanent-cancel`);
        }
      }

      // ── Una guida di gruppo vuota: tre posti, tutti aperti ────────────────
      const createRes = await api.post("/api/autoscuole/group-lessons", {
        data: {
          startsAt: at(day, 15).toISOString(),
          endsAt: at(day, 16).toISOString(),
          instructorId: instructor.id,
          vehicleId: car!.id,
          capacity: 3,
        },
      });
      const createJson = (await createRes.json()) as {
        success?: boolean;
        message?: string;
        data?: { groupLessonId: string };
      };
      expect(
        createJson.success,
        `POST /group-lessons → ${createJson.message ?? "errore"}`,
      ).toBeTruthy();
      const groupLessonId = createJson.data!.groupLessonId;
      created.push(groupLessonId);

      // ── Gli idonei: è la lista che alimenta il foglio «Aggiungi allievo» ──
      const eligibleRes = await api.get(
        `/api/autoscuole/group-lessons/${groupLessonId}/eligible-invitees`,
      );
      expect(eligibleRes.ok(), "GET /eligible-invitees").toBeTruthy();
      const eligible = ((await eligibleRes.json()) as { data: Invitee[] }).data;
      expect(Array.isArray(eligible), "gli idonei arrivano come lista").toBeTruthy();

      // ── L'invito ──────────────────────────────────────────────────────────
      const started = Date.now();
      const inviteRes = await api.post(
        `/api/autoscuole/group-lessons/${groupLessonId}/invite`,
        { data: {} },
      );
      const elapsed = Date.now() - started;
      const inviteJson = (await inviteRes.json()) as {
        success?: boolean;
        message?: string;
        data?: { inviteId: string; invitedCount: number };
      };

      // Il numero interessa anche quando il test passa: e' la misura che dice
      // se gli invii sono tornati dentro la risposta.
      console.log(`[REG-617] POST /invite ha risposto in ${elapsed}ms`);

      expect(
        inviteJson.success,
        `POST /invite → ${inviteJson.message ?? "errore"}`,
      ).toBeTruthy();
      expect(inviteJson.data?.inviteId, "l'invito ha un id").toBeTruthy();

      // Questo è il campo che l'app mostra: "Invito inviato a N allievi".
      const invitedCount = inviteJson.data?.invitedCount;
      expect(typeof invitedCount, "invitedCount è un numero").toBe("number");
      expect(invitedCount!, "invitedCount non è negativo").toBeGreaterThanOrEqual(0);
      if (eligible.length > 0) {
        // Il giorno è scelto lontano proprio perché nessuno sia occupato a
        // quell'ora: se c'è qualcuno da invitare, l'invito deve contarlo.
        expect(invitedCount!, "con allievi idonei, l'invito raggiunge qualcuno")
          .toBeGreaterThan(0);
      }

      // La guardia vera contro la regressione: se gli invii tornassero dentro
      // la risposta, su un'autoscuola popolata questo supererebbe il tempo che
      // il client concede, ed è esattamente quello che l'utente vedeva.
      expect(
        elapsed,
        `l'invito deve tornare entro i ${MOBILE_CLIENT_TIMEOUT_MS}ms del client (misurato: ${elapsed}ms)`,
      ).toBeLessThan(MOBILE_CLIENT_TIMEOUT_MS);

      // ── Reinvitare non è un errore: l'invito precedente viene superato ────
      const againRes = await api.post(
        `/api/autoscuole/group-lessons/${groupLessonId}/invite`,
        { data: {} },
      );
      const againJson = (await againRes.json()) as {
        success?: boolean;
        message?: string;
        data?: { inviteId: string; invitedCount: number };
      };
      expect(
        againJson.success,
        `secondo POST /invite → ${againJson.message ?? "errore"}`,
      ).toBeTruthy();
      expect(againJson.data?.inviteId, "il secondo invito è un invito nuovo").not.toBe(
        inviteJson.data?.inviteId,
      );
    } finally {
      for (const id of created) {
        await api.delete(`/api/autoscuole/group-lessons/${id}`);
      }
      const leftovers = (await bootstrap(api, windowStart, windowEnd)).data.appointments;
      for (const row of leftovers) {
        if (!row.id.startsWith("gl-empty:")) {
          await api.post(`/api/autoscuole/appointments/${row.id}/permanent-cancel`);
        }
      }
    }
  });
});
