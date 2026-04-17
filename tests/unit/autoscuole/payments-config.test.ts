jest.mock("@/email", () => ({
  sendDynamicEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/autoscuole/push", () => ({
  sendAutoscuolaPushToUsers: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/autoscuole/stripe-connect", () => ({
  getAutoscuolaStripeDestinationAccountId: jest.fn().mockResolvedValue("acct_destination_test"),
}));

import { getAutoscuolaPaymentConfig } from "@/lib/autoscuole/payments";
import { parseBookingGovernanceFromLimits } from "@/lib/autoscuole/booking-governance";
import { parseLessonPolicyFromLimits } from "@/lib/autoscuole/lesson-policy";
import { createPrismaMock } from "@/tests/helpers/db";

describe("autoscuole payment config parsing", () => {
  it("returns safe defaults when limits are missing", async () => {
    const prisma = createPrismaMock({
      companyService: {
        findFirst: jest.fn().mockResolvedValue({ limits: {} }),
      },
    });

    const config = await getAutoscuolaPaymentConfig({
      prisma: prisma as never,
      companyId: "company_test",
    });

    expect(config).toEqual({
      enabled: false,
      lessonPrice30: 25,
      lessonPrice60: 50,
      penaltyCutoffHours: 24,
      penaltyPercent: 50,
      channels: ["push", "email"],
      ficVatTypeId: null,
      ficPaymentMethodId: null,
    });
  });

  it("normalizes configured limits and removes invalid values", async () => {
    const prisma = createPrismaMock({
      companyService: {
        findFirst: jest.fn().mockResolvedValue({
          limits: {
            autoPaymentsEnabled: true,
            lessonPrice30: 30,
            lessonPrice60: 60,
            penaltyCutoffHoursPreset: 12,
            penaltyPercentPreset: 75,
            paymentNotificationChannels: ["push", "push", "email", "invalid"],
            ficVatTypeId: "vat_22",
            ficPaymentMethodId: "method_card",
          },
        }),
      },
    });

    const config = await getAutoscuolaPaymentConfig({
      prisma: prisma as never,
      companyId: "company_test",
    });

    expect(config).toEqual({
      enabled: true,
      lessonPrice30: 30,
      lessonPrice60: 60,
      penaltyCutoffHours: 12,
      penaltyPercent: 75,
      channels: ["push", "email"],
      ficVatTypeId: "vat_22",
      ficPaymentMethodId: "method_card",
    });
  });
});

describe("autoscuole policy parser helpers", () => {
  it("parses booking governance with fallbacks", () => {
    const parsed = parseBookingGovernanceFromLimits({
      appBookingActors: "both",
      instructorBookingMode: "manual_engine",
    });
    expect(parsed).toEqual({
      appBookingActors: "both",
      instructorBookingMode: "manual_engine",
    });

    const fallback = parseBookingGovernanceFromLimits({
      appBookingActors: "unknown",
      instructorBookingMode: "unknown",
    });
    expect(fallback).toEqual({
      appBookingActors: "students",
      instructorBookingMode: "manual_engine",
    });
  });

  it("parses lesson policy limits keeping only valid required types", () => {
    const policy = parseLessonPolicyFromLimits({
      lessonPolicyEnabled: true,
      lessonRequiredTypesEnabled: true,
      lessonRequiredTypes: ["manovre", "extraurbano", "invalid", "manovre"],
      lessonTypeConstraints: {
        manovre: {
          daysOfWeek: [1, 3, 5],
          startMinutes: 14 * 60,
          endMinutes: 16 * 60,
        },
      },
    });

    expect(policy.lessonPolicyEnabled).toBe(true);
    expect(policy.lessonRequiredTypesEnabled).toBe(true);
    expect(policy.lessonRequiredTypes).toEqual(["manovre", "extraurbano"]);
    expect(policy.lessonTypeConstraints.manovre).toEqual({
      daysOfWeek: [1, 3, 5],
      startMinutes: 840,
      endMinutes: 960,
    });
  });
});
