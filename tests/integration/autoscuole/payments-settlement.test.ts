jest.mock("@/lib/integrations/fatture-in-cloud", () => ({
  getFicConnection: jest.fn().mockRejectedValue(
    new Error("Fatture in Cloud non connesso per questa company."),
  ),
}));

jest.mock("@/email", () => ({
  sendDynamicEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/autoscuole/push", () => ({
  sendAutoscuolaPushToUsers: jest.fn().mockResolvedValue(undefined),
}));

import {
  processAutoscuolaInvoiceFinalization,
  processAutoscuolaLessonSettlement,
  processAutoscuolaPenaltyCharges,
} from "@/lib/autoscuole/payments";
import { buildAppointment, buildStudent } from "@/tests/fixtures/autoscuole.factory";
import { createPrismaMock } from "@/tests/helpers/db";

describe("autoscuole payment settlement flows", () => {
  it("marks cancelled-before-cutoff appointments as waived in penalty phase", async () => {
    const appointment = buildAppointment({
      status: "cancelled",
      penaltyCutoffAt: new Date("2026-02-24T09:00:00.000Z"),
      cancelledAt: new Date("2026-02-24T08:00:00.000Z"),
      paidAmount: 0,
    });

    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = createPrismaMock({
      autoscuolaAppointment: {
        findMany: jest.fn().mockResolvedValue([appointment]),
        update,
      },
    });

    const result = await processAutoscuolaPenaltyCharges({
      prisma: prisma as never,
      now: new Date("2026-02-24T10:00:00.000Z"),
    });

    expect(result).toEqual({ attempted: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { id: appointment.id },
      data: {
        paymentStatus: "waived",
        invoiceStatus: "not_required",
      },
    });
  });

  it("settles payment status to paid when final amount is already covered", async () => {
    const appointment = buildAppointment({
      status: "completed",
      priceAmount: 50,
      penaltyAmount: 25,
      paidAmount: 50,
      paymentStatus: "partial_paid",
      startsAt: new Date("2026-02-24T09:00:00.000Z"),
      endsAt: new Date("2026-02-24T10:00:00.000Z"),
    });

    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = createPrismaMock({
      autoscuolaAppointment: {
        findMany: jest.fn().mockResolvedValue([appointment]),
        findUnique: jest.fn().mockResolvedValue({
          id: appointment.id,
          paymentRequired: true,
          status: "completed",
          priceAmount: appointment.priceAmount,
          penaltyAmount: appointment.penaltyAmount,
          penaltyCutoffAt: appointment.penaltyCutoffAt,
          cancelledAt: appointment.cancelledAt,
          paidAmount: appointment.paidAmount,
          paymentStatus: "partial_paid",
        }),
        update,
      },
    });

    const result = await processAutoscuolaLessonSettlement({
      prisma: prisma as never,
      now: new Date("2026-02-24T11:00:00.000Z"),
    });

    expect(result).toEqual({ attempted: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { id: appointment.id },
      data: { paymentStatus: "paid" },
    });
  });

  it("marks invoice as pending_fic when FIC is not connected", async () => {
    const appointment = {
      ...buildAppointment({
        status: "completed",
        paidAmount: 50,
        priceAmount: 50,
        penaltyAmount: 25,
        invoiceId: null,
        invoiceStatus: "pending",
      }),
      student: buildStudent(),
    };

    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = createPrismaMock({
      companyService: {
        findFirst: jest.fn().mockResolvedValue({
          limits: {
            autoPaymentsEnabled: true,
            ficVatTypeId: "vat_22",
            ficPaymentMethodId: "method_1",
          },
        }),
      },
      autoscuolaAppointment: {
        findMany: jest.fn().mockResolvedValue([appointment]),
        update,
      },
      autoscuolaAppointmentPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(undefined),
      },
    });

    const result = await processAutoscuolaInvoiceFinalization({
      prisma: prisma as never,
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(result).toEqual({ issued: 0 });
    expect(update).toHaveBeenCalledWith({
      where: { id: appointment.id },
      data: {
        invoiceStatus: "pending_fic",
      },
    });
  });
});
