import { canManageLessonPayments } from "@/lib/autoscuole/lesson-payments";

const member = (autoscuolaRole: string | null, role = "member") => ({
  role,
  autoscuolaRole,
});

describe("permesso: segnare una guida pagata / da pagare (REG-450)", () => {
  it("il titolare può", () => {
    expect(canManageLessonPayments(member("OWNER", "admin"))).toBe(true);
    expect(canManageLessonPayments(member("OWNER"))).toBe(true);
  });

  it("l'istruttore-titolare può", () => {
    expect(canManageLessonPayments(member("INSTRUCTOR_OWNER", "admin"))).toBe(true);
  });

  it("l'istruttore può — è il punto della feature, incassa anche lui", () => {
    expect(canManageLessonPayments(member("INSTRUCTOR"))).toBe(true);
  });

  it("l'admin di piattaforma può anche senza ruolo autoscuola", () => {
    expect(canManageLessonPayments(member(null, "admin"))).toBe(true);
  });

  it("l'allievo NON può", () => {
    expect(canManageLessonPayments(member("STUDENT"))).toBe(false);
  });

  it("un membro senza ruolo autoscuola NON può", () => {
    expect(canManageLessonPayments(member(null))).toBe(false);
  });

  // Il permesso è volutamente CIECO alla guida: non riceve l'appuntamento.
  // Una prima versione restringeva l'istruttore alle proprie guide; è stata
  // tolta di proposito (l'incasso è amministrativo, non didattico) e questo
  // test esiste perché la restrizione non rientri per distrazione.
  it("non dipende da chi ha tenuto la guida: la firma non vede l'appuntamento", () => {
    expect(canManageLessonPayments.length).toBe(1);
    const istruttore = member("INSTRUCTOR");
    // Stesso istruttore, due guide diverse: nessuna differenza possibile.
    expect(canManageLessonPayments(istruttore)).toBe(
      canManageLessonPayments(istruttore),
    );
    expect(canManageLessonPayments(istruttore)).toBe(true);
  });
});
