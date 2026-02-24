export const buildStudent = (overrides?: Partial<{
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
}>) => ({
  id: "student_1",
  firstName: "Mario",
  lastName: "Rossi",
  name: "Mario Rossi",
  email: "mario.rossi@example.com",
  ...overrides,
});

export const buildInstructor = (overrides?: Partial<{ id: string; name: string }>) => ({
  id: "instructor_1",
  name: "Istruttore Demo",
  ...overrides,
});

export const buildVehicle = (overrides?: Partial<{ id: string; name: string }>) => ({
  id: "vehicle_1",
  name: "Fiat 500",
  ...overrides,
});

export const buildAppointment = (
  overrides?: Partial<{
    id: string;
    companyId: string;
    studentId: string;
    status: string;
    type: string;
    paymentRequired: boolean;
    paymentStatus: string;
    startsAt: Date;
    endsAt: Date | null;
    priceAmount: number;
    penaltyAmount: number;
    paidAmount: number;
    penaltyCutoffAt: Date | null;
    cancelledAt: Date | null;
    invoiceId: string | null;
    invoiceStatus: string | null;
  }>,
) => ({
  id: "appointment_1",
  companyId: "company_test",
  studentId: "student_1",
  status: "scheduled",
  type: "guida",
  paymentRequired: true,
  paymentStatus: "pending_penalty",
  startsAt: new Date("2026-02-24T10:00:00.000Z"),
  endsAt: new Date("2026-02-24T11:00:00.000Z"),
  priceAmount: 50,
  penaltyAmount: 25,
  paidAmount: 0,
  penaltyCutoffAt: new Date("2026-02-23T10:00:00.000Z"),
  cancelledAt: null,
  invoiceId: null,
  invoiceStatus: "pending",
  ...overrides,
});
