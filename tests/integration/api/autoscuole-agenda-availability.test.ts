/**
 * REG-795: `GET /api/autoscuole/agenda/availability` espone all'app titolare le
 * fasce di tutti gli istruttori, le stesse dell'agenda web. Solo titolare o
 * istruttore titolare, intervallo di giorni `YYYY-MM-DD` con `to` escluso.
 */

const membership = {
  companyId: "company_test",
  userId: "u1",
  role: "admin",
  autoscuolaRole: "OWNER" as string,
};

jest.mock("@/lib/utils", () => ({ formatError: (e: unknown) => String(e) }));
jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn(async () => ({ membership })),
}));
jest.mock("@/lib/actions/autoscuole.actions", () => ({
  getInstructorAvailabilityForAgenda: jest.fn(async () => ({
    success: true,
    data: [
      {
        instructorId: "i1",
        instructorName: "Luca Ferrari",
        days: { "2026-11-24": [{ startMinutes: 480, endMinutes: 720 }] },
      },
    ],
  })),
}));

import { GET } from "@/app/api/autoscuole/agenda/availability/route";
import { getInstructorAvailabilityForAgenda } from "@/lib/actions/autoscuole.actions";

const call = (query: string) =>
  GET(new Request(`https://reglo.test/api/autoscuole/agenda/availability${query}`));

beforeEach(() => {
  jest.mocked(getInstructorAvailabilityForAgenda).mockClear();
  membership.role = "admin";
  membership.autoscuolaRole = "OWNER";
});

describe("GET /api/autoscuole/agenda/availability", () => {
  it("il titolare riceve le fasce di tutti gli istruttori per la settimana", async () => {
    const res = await call("?from=2026-11-23&to=2026-11-30");
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data[0]).toMatchObject({ instructorId: "i1", days: { "2026-11-24": [{ startMinutes: 480 }] } });
    expect(getInstructorAvailabilityForAgenda).toHaveBeenCalledWith({ from: "2026-11-23", to: "2026-11-30" });
  });

  it("anche l'istruttore titolare", async () => {
    membership.autoscuolaRole = "INSTRUCTOR_OWNER";
    expect((await call("?from=2026-11-23&to=2026-11-24")).status).toBe(200);
  });

  it("l'istruttore e l'allievo no", async () => {
    membership.role = "member";
    for (const role of ["INSTRUCTOR", "STUDENT"]) {
      membership.autoscuolaRole = role;
      expect((await call("?from=2026-11-23&to=2026-11-30")).status).toBe(403);
    }
    expect(getInstructorAvailabilityForAgenda).not.toHaveBeenCalled();
  });

  it("from/to mancanti o non in formato giorno: 400", async () => {
    expect((await call("")).status).toBe(400);
    expect((await call("?from=2026-11-23")).status).toBe(400);
    expect((await call("?from=2026-11-23T00:00:00Z&to=2026-11-30")).status).toBe(400);
  });

  it("intervallo vuoto, rovesciato o oltre sei settimane: 400", async () => {
    expect((await call("?from=2026-11-23&to=2026-11-23")).status).toBe(400);
    expect((await call("?from=2026-11-30&to=2026-11-23")).status).toBe(400);
    expect((await call("?from=2026-11-01&to=2026-12-14")).status).toBe(400);
    expect((await call("?from=2026-11-01&to=2026-12-13")).status).toBe(200);
  });
});
