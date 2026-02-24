const mockStripeCustomersCreate = jest.fn();
const mockStripeCustomersRetrieve = jest.fn();
const mockStripePaymentMethodsList = jest.fn();

jest.mock("stripe", () => {
  const Stripe = jest.fn().mockImplementation(() => ({
    customers: {
      create: mockStripeCustomersCreate,
      retrieve: mockStripeCustomersRetrieve,
    },
    paymentMethods: {
      list: mockStripePaymentMethodsList,
    },
  }));
  return {
    __esModule: true,
    default: Stripe,
  };
});

jest.mock("@/lib/autoscuole/stripe-connect", () => ({
  getAutoscuolaStripeDestinationAccountId: jest.fn().mockResolvedValue("acct_destination_test"),
}));

jest.mock("@/email", () => ({
  sendDynamicEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/autoscuole/push", () => ({
  sendAutoscuolaPushToUsers: jest.fn().mockResolvedValue(undefined),
}));

import { Prisma } from "@prisma/client";
import { prepareAppointmentPaymentSnapshot } from "@/lib/autoscuole/payments";
import { createPrismaMock } from "@/tests/helpers/db";

describe("prepareAppointmentPaymentSnapshot", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStripeCustomersCreate.mockResolvedValue({ id: "cus_test" });
    mockStripeCustomersRetrieve.mockResolvedValue({
      deleted: false,
      invoice_settings: { default_payment_method: null },
    });
    mockStripePaymentMethodsList.mockResolvedValue({ data: [] });
  });

  it("returns not_required snapshot when auto payments are disabled", async () => {
    const prisma = createPrismaMock({
      companyService: {
        findFirst: jest.fn().mockResolvedValue({
          limits: { autoPaymentsEnabled: false },
        }),
      },
    });

    const snapshot = await prepareAppointmentPaymentSnapshot({
      prisma: prisma as never,
      companyId: "company_test",
      studentId: "student_test",
      startsAt: new Date("2026-02-24T09:00:00.000Z"),
      endsAt: new Date("2026-02-24T09:30:00.000Z"),
    });

    expect(snapshot.paymentRequired).toBe(false);
    expect(snapshot.paymentStatus).toBe("not_required");
    expect(snapshot.priceAmount).toEqual(new Prisma.Decimal("0"));
    expect(snapshot.penaltyAmount).toEqual(new Prisma.Decimal("0"));
  });

  it("throws when payment method is missing and auto payments are enabled", async () => {
    const prisma = createPrismaMock({
      companyService: {
        findFirst: jest.fn().mockResolvedValue({
          limits: {
            autoPaymentsEnabled: true,
            lessonPrice30: 25,
            lessonPrice60: 50,
            paymentNotificationChannels: ["push", "email"],
          },
        }),
      },
      autoscuolaAppointment: {
        count: jest.fn().mockResolvedValue(0),
      },
      autoscuolaStudentLessonCreditBalance: {
        findUnique: jest.fn().mockResolvedValue({
          id: "balance_test",
          availableCredits: 0,
        }),
      },
      autoscuolaStudentPaymentProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: "profile_test",
          stripeCustomerId: "cus_test",
          stripeDefaultPaymentMethodId: null,
          status: "requires_update",
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      companyMember: {
        findFirst: jest.fn().mockResolvedValue({
          user: { email: "student@example.com" },
        }),
      },
    });

    await expect(
      prepareAppointmentPaymentSnapshot({
        prisma: prisma as never,
        companyId: "company_test",
        studentId: "student_test",
        startsAt: new Date("2026-02-24T09:00:00.000Z"),
        endsAt: new Date("2026-02-24T10:00:00.000Z"),
      }),
    ).rejects.toThrow("Metodo di pagamento mancante");
  });
});
