import {
  canApproveAvailabilityOverride,
  canReadAvailability,
  canWriteAvailability,
} from "@/lib/autoscuole/availability-access";

const owner = { role: "admin", autoscuolaRole: "OWNER", userId: "u-owner" };
const instructorOwner = { role: "admin", autoscuolaRole: "INSTRUCTOR_OWNER", userId: "u-io" };
const instructor = { role: "member", autoscuolaRole: "INSTRUCTOR", userId: "u-instr" };
const student = { role: "member", autoscuolaRole: "STUDENT", userId: "u-student" };

describe("canWriteAvailability", () => {
  it("titolare e istruttore titolare: tutto", () => {
    for (const m of [owner, instructorOwner]) {
      expect(canWriteAvailability(m, "instructor", "i-altro", null)).toBe(true);
      expect(canWriteAvailability(m, "vehicle", "v-1", null)).toBe(true);
      expect(canWriteAvailability(m, "student", "u-x", null)).toBe(true);
    }
  });

  it("istruttore: le proprie fasce e i veicoli, non quelle degli altri", () => {
    expect(canWriteAvailability(instructor, "instructor", "i-mio", "i-mio")).toBe(true);
    expect(canWriteAvailability(instructor, "instructor", "i-altro", "i-mio")).toBe(false);
    expect(canWriteAvailability(instructor, "instructor", "i-mio", null)).toBe(false);
    expect(canWriteAvailability(instructor, "vehicle", "v-1", "i-mio")).toBe(true);
    expect(canWriteAvailability(instructor, "student", "u-x", "i-mio")).toBe(false);
  });

  it("allievo: solo le proprie preferenze", () => {
    expect(canWriteAvailability(student, "student", "u-student", null)).toBe(true);
    expect(canWriteAvailability(student, "student", "u-altro", null)).toBe(false);
    expect(canWriteAvailability(student, "instructor", "i-1", null)).toBe(false);
    expect(canWriteAvailability(student, "vehicle", "v-1", null)).toBe(false);
  });

  it("ruolo sconosciuto: niente", () => {
    expect(canWriteAvailability({ role: "member", autoscuolaRole: null, userId: "u" }, "vehicle", "v", null)).toBe(false);
  });
});

describe("canApproveAvailabilityOverride", () => {
  it("staff sì, allievo no", () => {
    expect(canApproveAvailabilityOverride(owner)).toBe(true);
    expect(canApproveAvailabilityOverride(instructor)).toBe(true);
    expect(canApproveAvailabilityOverride(student)).toBe(false);
  });
});

describe("canReadAvailability (REG-802)", () => {
  it("titolare, istruttore titolare e istruttore: leggono tutto, anche gli allievi", () => {
    for (const m of [owner, instructorOwner, instructor]) {
      expect(canReadAvailability(m, "student", "u-x")).toBe(true);
      expect(canReadAvailability(m, "instructor", "i-1")).toBe(true);
      expect(canReadAvailability(m, undefined, undefined)).toBe(true);
    }
  });

  it("allievo: solo le proprie preferenze", () => {
    expect(canReadAvailability(student, "student", "u-student")).toBe(true);
    expect(canReadAvailability(student, "student", "u-altro")).toBe(false);
    expect(canReadAvailability(student, "instructor", "i-1")).toBe(false);
    expect(canReadAvailability(student, undefined, undefined)).toBe(false);
  });
});
