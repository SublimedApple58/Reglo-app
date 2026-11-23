import {
  confirmsCompanyName,
  describeMemberMaintenance,
  isAudienceSilencedByMaintenance,
  isEntryClosedByMaintenance,
  isMemberBlockedByMaintenance,
} from "@/lib/maintenance";

describe("modalità manutenzione (REG-773)", () => {
  it("senza manutenzione non blocca nessuno", () => {
    for (const role of ["OWNER", "INSTRUCTOR_OWNER", "INSTRUCTOR", "STUDENT"]) {
      expect(isMemberBlockedByMaintenance(null, role)).toBe(false);
    }
  });

  it("solo titolare: blocca OWNER e INSTRUCTOR_OWNER, non istruttori e allievi", () => {
    expect(isMemberBlockedByMaintenance("OWNER_ONLY", "OWNER")).toBe(true);
    expect(isMemberBlockedByMaintenance("OWNER_ONLY", "INSTRUCTOR_OWNER")).toBe(true);
    expect(isMemberBlockedByMaintenance("OWNER_ONLY", "INSTRUCTOR")).toBe(false);
    expect(isMemberBlockedByMaintenance("OWNER_ONLY", "STUDENT")).toBe(false);
  });

  it("tutti: blocca ogni ruolo", () => {
    for (const role of ["OWNER", "INSTRUCTOR_OWNER", "INSTRUCTOR", "STUDENT"]) {
      expect(isMemberBlockedByMaintenance("EVERYONE", role)).toBe(true);
    }
  });

  it("tace i messaggi al titolare con solo titolare, tutti con tutti", () => {
    expect(isAudienceSilencedByMaintenance("OWNER_ONLY", "owner")).toBe(true);
    expect(isAudienceSilencedByMaintenance("OWNER_ONLY", "student")).toBe(false);
    expect(isAudienceSilencedByMaintenance("OWNER_ONLY", "instructor")).toBe(false);
    expect(isAudienceSilencedByMaintenance("EVERYONE", "student")).toBe(true);
    expect(isAudienceSilencedByMaintenance(null, "owner")).toBe(false);
  });

  it("chiude gli ingressi pubblici solo con tutti, o agli inviti da titolare", () => {
    expect(isEntryClosedByMaintenance("EVERYONE")).toBe(true);
    expect(isEntryClosedByMaintenance("OWNER_ONLY")).toBe(false);
    expect(isEntryClosedByMaintenance("OWNER_ONLY", true)).toBe(true);
    expect(isEntryClosedByMaintenance(null, true)).toBe(false);
  });

  it("la conferma accetta il nome a meno di maiuscole e spazi", () => {
    expect(confirmsCompanyName("  autoscuola   ROSSI ", "Autoscuola Rossi")).toBe(true);
    expect(confirmsCompanyName("Autoscuola Rosi", "Autoscuola Rossi")).toBe(false);
    expect(confirmsCompanyName("", "")).toBe(false);
  });

  it("descrive lo stato per l'app mobile", () => {
    const since = new Date("2026-11-23T10:00:00.000Z");
    expect(describeMemberMaintenance({ maintenanceScope: null, maintenanceSince: null }, "OWNER")).toBeNull();
    expect(
      describeMemberMaintenance({ maintenanceScope: "OWNER_ONLY", maintenanceSince: since }, "STUDENT"),
    ).toEqual({ scope: "OWNER_ONLY", since: since.toISOString(), blocked: false });
  });
});
