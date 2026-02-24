const cacheStore = new Map<string, unknown>();

jest.mock("@/lib/autoscuole/cache", () => ({
  AUTOSCUOLE_CACHE_SEGMENTS: {
    AGENDA: "agenda",
  },
  buildAutoscuoleCacheKey: jest.fn(
    async ({
      companyId,
      segment,
      scope,
    }: {
      companyId: string;
      segment: string;
      scope: string;
    }) => `${companyId}:${segment}:${scope}`,
  ),
  hashCacheInput: jest.fn((input: Record<string, unknown>) => JSON.stringify(input)),
  readAutoscuoleCache: jest.fn(async (key: string) => cacheStore.get(key) ?? null),
  writeAutoscuoleCache: jest.fn(async (key: string, payload: unknown) => {
    cacheStore.set(key, payload);
  }),
}));

jest.mock("@/lib/service-access", () => ({
  requireServiceAccess: jest.fn().mockResolvedValue({
    membership: { companyId: "company_test" },
  }),
}));

jest.mock("@/lib/actions/autoscuole.actions", () => ({
  getAutoscuolaAgendaBootstrapAction: jest.fn().mockResolvedValue({
    success: true,
    data: {
      appointments: [
        {
          id: "appointment_1",
        },
      ],
      students: [{ id: "student_1", firstName: "Mario", lastName: "Rossi" }],
      instructors: [{ id: "instructor_1", name: "Istruttore Demo" }],
      vehicles: [{ id: "vehicle_1", name: "Fiat 500" }],
      meta: {
        from: "2026-02-24T00:00:00.000Z",
        to: "2026-03-03T00:00:00.000Z",
        generatedAt: "2026-02-24T08:00:00.000Z",
        count: 1,
      },
    },
  }),
}));

import { GET } from "@/app/api/autoscuole/agenda/bootstrap/route";

describe("GET /api/autoscuole/agenda/bootstrap", () => {
  beforeEach(() => {
    cacheStore.clear();
  });

  it("returns 400 when from/to are missing", async () => {
    const request = new Request("https://reglo.test/api/autoscuole/agenda/bootstrap");
    const response = await GET(request);
    const payload = (await response.json()) as { success: boolean; message: string };

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("from/to obbligatori");
  });

  it("returns bootstrap payload and then cache hit for same range", async () => {
    const request = new Request(
      "https://reglo.test/api/autoscuole/agenda/bootstrap?from=2026-02-24T00:00:00.000Z&to=2026-03-03T00:00:00.000Z&limit=50",
    );

    const response1 = await GET(request);
    const json1 = (await response1.json()) as {
      success: boolean;
      data: { meta: { cache: boolean } };
    };

    expect(response1.status).toBe(200);
    expect(json1.success).toBe(true);
    expect(json1.data.meta.cache).toBe(false);

    const response2 = await GET(request);
    const json2 = (await response2.json()) as {
      success: boolean;
      data: { meta: { cache: boolean } };
    };

    expect(response2.status).toBe(200);
    expect(json2.success).toBe(true);
    expect(json2.data.meta.cache).toBe(true);
  });
});
