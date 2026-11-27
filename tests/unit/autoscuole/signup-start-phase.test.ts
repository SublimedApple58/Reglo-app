import {
  autoAssignFor,
  decideSignupPhase,
  resolveSignupStartPhase,
} from "@/lib/autoscuole/signup-start-phase";

const theory = { phasesEnabled: ["TEORIA", "PRATICA"], quizSeats: 2 };

describe("resolveSignupStartPhase", () => {
  it("usa il valore salvato", () => {
    expect(resolveSignupStartPhase({ signupStartPhase: "PRATICA" })).toBe("PRATICA");
    expect(resolveSignupStartPhase({ signupStartPhase: "AWAITING", autoAssignQuizOnSignup: true })).toBe("AWAITING");
  });

  it("senza valore ripiega sul vecchio interruttore", () => {
    expect(resolveSignupStartPhase({ autoAssignQuizOnSignup: true })).toBe("TEORIA");
    expect(resolveSignupStartPhase({ autoAssignQuizOnSignup: false })).toBe("AWAITING");
    expect(resolveSignupStartPhase({})).toBe("AWAITING");
    expect(resolveSignupStartPhase(null)).toBe("AWAITING");
  });

  it("ignora un valore non valido", () => {
    expect(resolveSignupStartPhase({ signupStartPhase: "PATENTATO", autoAssignQuizOnSignup: true })).toBe("TEORIA");
  });
});

describe("decideSignupPhase", () => {
  it("senza Teoria attiva parte sempre in foglio rosa", () => {
    expect(decideSignupPhase({ phasesEnabled: ["PRATICA"], signupStartPhase: "TEORIA", quizSeats: 5 }, 0)).toEqual({
      studentPhase: "PRATICA",
      grantSeat: false,
    });
    expect(decideSignupPhase(null, 0)).toEqual({ studentPhase: "PRATICA", grantSeat: false });
  });

  it("foglio rosa con la Teoria attiva: niente posto quiz", () => {
    expect(decideSignupPhase({ ...theory, signupStartPhase: "PRATICA" }, 0)).toEqual({
      studentPhase: "PRATICA",
      grantSeat: false,
    });
  });

  it("in attesa: niente posto quiz anche se ce ne sono", () => {
    expect(decideSignupPhase({ ...theory, signupStartPhase: "AWAITING" }, 0)).toEqual({
      studentPhase: "AWAITING",
      grantSeat: false,
    });
  });

  it("teoria: prende il posto se c'è, altrimenti in attesa", () => {
    expect(decideSignupPhase({ ...theory, signupStartPhase: "TEORIA" }, 1)).toEqual({
      studentPhase: "TEORIA",
      grantSeat: true,
    });
    expect(decideSignupPhase({ ...theory, signupStartPhase: "TEORIA" }, 2)).toEqual({
      studentPhase: "AWAITING",
      grantSeat: false,
    });
    expect(decideSignupPhase({ phasesEnabled: ["TEORIA"], signupStartPhase: "TEORIA" }, 0)).toEqual({
      studentPhase: "AWAITING",
      grantSeat: false,
    });
  });

  it("autoscuole col vecchio interruttore: come prima", () => {
    expect(decideSignupPhase({ ...theory, autoAssignQuizOnSignup: true }, 0)).toEqual({
      studentPhase: "TEORIA",
      grantSeat: true,
    });
    expect(decideSignupPhase({ ...theory, autoAssignQuizOnSignup: true }, 2)).toEqual({
      studentPhase: "AWAITING",
      grantSeat: false,
    });
    expect(decideSignupPhase({ ...theory, autoAssignQuizOnSignup: false }, 0)).toEqual({
      studentPhase: "AWAITING",
      grantSeat: false,
    });
  });
});

describe("autoAssignFor", () => {
  it("è vero solo per la teoria", () => {
    expect(autoAssignFor("TEORIA")).toBe(true);
    expect(autoAssignFor("AWAITING")).toBe(false);
    expect(autoAssignFor("PRATICA")).toBe(false);
  });
});
