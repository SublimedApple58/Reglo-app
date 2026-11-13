jest.mock("@/email", () => ({
  sendDynamicEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/autoscuole/push", () => ({
  sendAutoscuolaPushToUsers: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/autoscuole/stripe-connect", () => ({
  getAutoscuolaStripeDestinationAccountId: jest.fn().mockResolvedValue("acct_destination_test"),
}));

import { applyLessonCreditToExistingAppointment } from "@/lib/autoscuole/payments";
import { createPrismaMock } from "@/tests/helpers/db";

const appointment = (type: string) => ({
  id: "appt_1",
  companyId: "company_1",
  studentId: "student_1",
  creditApplied: false,
  manualPaymentStatus: "unpaid",
  type,
});

// Configurazione di Robatto: crediti attivi ma non obbligatori.
const optionalCreditsLimits = { lessonCreditFlowEnabled: true, lessonCreditsRequired: false };

describe("applyLessonCreditToExistingAppointment", () => {
  it.each(["group_lesson", "esame"])("non scala un credito su %s", async (type) => {
    const prisma = createPrismaMock({
      autoscuolaAppointment: {
        findUnique: jest.fn().mockResolvedValue(appointment(type)),
        update: jest.fn(),
      },
      companyService: {
        findFirst: jest.fn().mockResolvedValue({ limits: optionalCreditsLimits }),
      },
    });

    const result = await applyLessonCreditToExistingAppointment({
      prisma: prisma as never,
      appointmentId: "appt_1",
    });

    expect(result).toEqual({ applied: false });
    expect(prisma.companyService.findFirst).not.toHaveBeenCalled();
    expect(prisma.autoscuolaAppointment.update).not.toHaveBeenCalled();
  });

  it("su una guida singola prosegue e legge la configurazione crediti", async () => {
    const prisma = createPrismaMock({
      autoscuolaAppointment: {
        findUnique: jest.fn().mockResolvedValue(appointment("guida")),
        update: jest.fn(),
      },
      companyService: {
        // Crediti obbligatori: la funzione si ferma subito dopo la config,
        // senza toccare il saldo.
        findFirst: jest.fn().mockResolvedValue({ limits: { lessonCreditFlowEnabled: true } }),
      },
    });

    const result = await applyLessonCreditToExistingAppointment({
      prisma: prisma as never,
      appointmentId: "appt_1",
    });

    expect(result).toEqual({ applied: false });
    expect(prisma.companyService.findFirst).toHaveBeenCalledTimes(1);
  });
});
