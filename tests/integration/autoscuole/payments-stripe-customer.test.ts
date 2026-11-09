const mockStripeCustomersCreate = jest.fn();

jest.mock("stripe", () => {
  const Stripe = jest.fn().mockImplementation(() => ({
    customers: { create: mockStripeCustomersCreate },
  }));
  return { __esModule: true, default: Stripe };
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

import { getOrCreateStudentPaymentProfile } from "@/lib/autoscuole/payments";
import { createPrismaMock } from "@/tests/helpers/db";

const prismaFor = (user: { email: string; name: string }) =>
  createPrismaMock({
    autoscuolaStudentPaymentProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: "profile_test", ...data })),
    },
    companyMember: {
      findFirst: jest.fn().mockResolvedValue({ user }),
    },
  });

describe("customer Stripe dell'allievo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy";
    mockStripeCustomersCreate.mockResolvedValue({ id: "cus_test" });
  });

  it("passa l'email vera a Stripe", async () => {
    await getOrCreateStudentPaymentProfile({
      prisma: prismaFor({ email: "mario@esempio.it", name: "Mario Rossi" }) as never,
      companyId: "company_test",
      studentId: "student_test",
    });
    expect(mockStripeCustomersCreate).toHaveBeenCalledWith({
      email: "mario@esempio.it",
      name: "Mario Rossi",
      metadata: { companyId: "company_test", studentId: "student_test" },
    });
  });

  it("non passa a Stripe l'email segnaposto dell'allievo col telefono", async () => {
    await getOrCreateStudentPaymentProfile({
      prisma: prismaFor({ email: "allievo+abc@no-app.reglo.local", name: "Giulia Ferraris" }) as never,
      companyId: "company_test",
      studentId: "student_test",
    });
    const payload = mockStripeCustomersCreate.mock.calls[0][0];
    expect(payload).not.toHaveProperty("email");
    expect(payload.name).toBe("Giulia Ferraris");
  });

  it("senza nome né email vera non inventa niente", async () => {
    await getOrCreateStudentPaymentProfile({
      prisma: prismaFor({ email: "allievo+abc@no-app.reglo.local", name: "NO_NAME" }) as never,
      companyId: "company_test",
      studentId: "student_test",
    });
    const payload = mockStripeCustomersCreate.mock.calls[0][0];
    expect(payload).toEqual({ metadata: { companyId: "company_test", studentId: "student_test" } });
  });
});
