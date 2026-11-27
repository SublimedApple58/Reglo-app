import { buildOnboardingSteps, validateStudentPhone } from "@/lib/autoscuole/student-onboarding";

const done = { profileCompleted: true, hasPhone: true, hasRealEmail: true, availabilityMode: "none" as const };

describe("buildOnboardingSteps (REG-802)", () => {
  it("tutto a posto: niente onboarding", () => {
    expect(buildOnboardingSteps(done)).toBeNull();
  });

  it("primo accesso normale: nome, email, cellulare, disponibilità", () => {
    expect(
      buildOnboardingSteps({ ...done, profileCompleted: false, availabilityMode: "required" })?.steps,
    ).toEqual([
      { key: "name", required: true },
      { key: "email", required: true },
      { key: "phone", required: true },
      { key: "availability", required: true },
    ]);
  });

  it("primo accesso con email segnaposto: niente step email", () => {
    const steps = buildOnboardingSteps({ ...done, profileCompleted: false, hasRealEmail: false })?.steps;
    expect(steps?.map((s) => s.key)).toEqual(["name", "phone"]);
  });

  it("profilo completo senza cellulare: solo il cellulare (era il PhoneGate)", () => {
    expect(buildOnboardingSteps({ ...done, hasPhone: false })?.steps).toEqual([{ key: "phone", required: true }]);
  });

  it("solo disponibilità rimandabile", () => {
    expect(buildOnboardingSteps({ ...done, availabilityMode: "optional" })?.steps).toEqual([
      { key: "availability", required: false },
    ]);
  });
});

describe("validateStudentPhone", () => {
  it("+39: almeno 9 cifre", () => {
    expect(validateStudentPhone("+39 347 123 4567")).toEqual({ ok: true, e164: "+393471234567" });
    expect(validateStudentPhone("+39 347 123 456")).toEqual({ ok: true, e164: "+39347123456" });
    expect(validateStudentPhone("+39 347 123 45")).toEqual({ ok: false, message: "Il numero sembra incompleto." });
    expect(validateStudentPhone("+39 347 1234")).toEqual({ ok: false, message: "Il numero sembra incompleto." });
    expect(validateStudentPhone("+39 347 123")).toEqual({ ok: false, message: "Il numero sembra incompleto." });
  });

  it("altri prefissi: regola generale", () => {
    expect(validateStudentPhone("+41 79 123 45 67")).toEqual({ ok: true, e164: "+41791234567" });
    expect(validateStudentPhone("+41 79 1")).toEqual({ ok: false, message: "Il numero sembra incompleto." });
  });

  it("senza prefisso, cellulare italiano", () => {
    expect(validateStudentPhone("347 123 4567")).toEqual({ ok: true, e164: "+393471234567" });
  });
});
