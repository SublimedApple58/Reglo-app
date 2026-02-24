const cacheStore = new Map<string, unknown>();

jest.mock("@/lib/autoscuole/cache", () => ({
  AUTOSCUOLE_CACHE_SEGMENTS: {
    PAYMENTS: "payments",
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

jest.mock("@/lib/actions/autoscuole-settings.actions", () => ({
  getAutoscuolaSettingsForCompany: jest.fn().mockResolvedValue({
    autoPaymentsEnabled: true,
    lessonPrice30: 25,
    lessonPrice60: 50,
  }),
}));

jest.mock("@/lib/autoscuole/payments", () => ({
  getAutoscuolaPaymentsOverview: jest.fn().mockResolvedValue({
    totalRequired: 3,
    paidCount: 2,
    insolutiCount: 0,
    pendingPenaltyCount: 1,
    partialCount: 0,
  }),
  getAutoscuolaPaymentsAppointments: jest.fn().mockResolvedValue([
    {
      id: "appointment_1",
      paymentStatus: "paid",
    },
  ]),
}));

jest.mock("@/lib/autoscuole/stripe-connect", () => ({
  getAutoscuolaStripeConnectStatus: jest.fn().mockResolvedValue({
    connected: true,
    status: "active",
    ready: true,
  }),
}));

jest.mock("@/db/prisma", () => ({
  prisma: {
    integrationConnection: {
      findUnique: jest.fn().mockResolvedValue({
        status: "connected",
        metadata: {
          entityId: "fic_entity_1",
        },
      }),
    },
  },
}));

import { GET } from "@/app/api/autoscuole/payments/bootstrap/route";

describe("GET /api/autoscuole/payments/bootstrap", () => {
  beforeEach(() => {
    cacheStore.clear();
  });

  it("returns bootstrap payload and then serves cache on repeated request", async () => {
    const request = new Request(
      "https://reglo.test/api/autoscuole/payments/bootstrap?limit=20",
    );

    const response1 = await GET(request);
    const json1 = (await response1.json()) as {
      success: boolean;
      data: { meta: { cache: boolean } };
    };

    expect(response1.status).toBe(200);
    expect(json1.success).toBe(true);
    expect(json1.data.meta.cache).toBe(false);
    expect(response1.headers.get("server-timing")).toContain("total;");

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
