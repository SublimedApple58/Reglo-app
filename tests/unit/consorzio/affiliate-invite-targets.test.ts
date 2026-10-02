import {
  affiliateInviteTargets,
  needsOwnerInvite,
  type InviteCandidate,
} from "@/lib/consorzio/affiliate-invite-targets";

/**
 * Il bug del 2026-10-02: il pulsante "Invita i titolari non invitati" diceva
 * 37 e il modale che apriva diceva "Invita 0 titolari". Due conti diversi per
 * la stessa domanda. Qui c'è un conto solo, e questi test lo inchiodano.
 */

const school = (over: Partial<InviteCandidate> = {}): InviteCandidate => ({
  schoolId: `s-${over.schoolName ?? "x"}`,
  schoolName: "Autoscuola X",
  email: "titolare@example.it",
  access: "not_invited",
  ...over,
});

describe("needsOwnerInvite", () => {
  it("invita chi non può entrare e non ha un invito valido", () => {
    expect(needsOwnerInvite("not_linked")).toBe(true);
    expect(needsOwnerInvite("not_invited")).toBe(true);
    expect(needsOwnerInvite("expired")).toBe(true);
  });

  it("lascia fuori chi è già invitato o già entra", () => {
    expect(needsOwnerInvite("invited")).toBe(false);
    expect(needsOwnerInvite("active")).toBe(false);
  });
});

describe("affiliateInviteTargets", () => {
  it("include le scuole NON collegate — era il motivo dello zero in produzione", () => {
    // In prod tutte e 37 le consorziate erano `not_linked` con l'email
    // valorizzata: l'anteprima le scartava e il modale restava vuoto.
    const targets = affiliateInviteTargets([
      school({ schoolName: "Autoscuola Arno", email: "autoscuolaarno@gmail.com", access: "not_linked" }),
    ]);
    expect(targets.groups).toEqual([
      {
        email: "autoscuolaarno@gmail.com",
        schools: ["Autoscuola Arno"],
        schoolIds: ["s-Autoscuola Arno"],
      },
    ]);
    expect(targets.missingEmail).toEqual([]);
  });

  it("un titolare con più sedi è UN gruppo, non cinque", () => {
    const targets = affiliateInviteTargets([
      school({ schoolName: "ODOS 1", email: "amministrazione@autoscuola2go.it", access: "not_linked" }),
      school({ schoolName: "ODOS 2", email: "AMMINISTRAZIONE@autoscuola2go.it", access: "not_invited" }),
      school({ schoolName: "ODOS 3", email: " amministrazione@autoscuola2go.it ", access: "expired" }),
    ]);
    expect(targets.groups).toHaveLength(1);
    expect(targets.groups[0].schools).toEqual(["ODOS 1", "ODOS 2", "ODOS 3"]);
    expect(targets.schoolsCount).toBe(3);
  });

  it("i titolari con più sedi vengono per primi", () => {
    const targets = affiliateInviteTargets([
      school({ schoolName: "Sola", email: "una@example.it" }),
      school({ schoolName: "Due A", email: "due@example.it" }),
      school({ schoolName: "Due B", email: "due@example.it" }),
    ]);
    expect(targets.groups.map((group) => group.email)).toEqual([
      "due@example.it",
      "una@example.it",
    ]);
  });

  it("salta chi è già invitato o accede", () => {
    const targets = affiliateInviteTargets([
      school({ schoolName: "Invitata", email: "a@example.it", access: "invited" }),
      school({ schoolName: "Accede", email: "b@example.it", access: "active" }),
      school({ schoolName: "Scaduta", email: "c@example.it", access: "expired" }),
    ]);
    expect(targets.groups.map((group) => group.email)).toEqual(["c@example.it"]);
  });

  it("chi non ha email finisce in missingEmail, non nel conteggio", () => {
    const targets = affiliateInviteTargets([
      school({ schoolName: "Senza email", email: null }),
      school({ schoolName: "Email vuota", email: "   " }),
      school({ schoolName: "Con email", email: "ok@example.it" }),
    ]);
    expect(targets.groups).toHaveLength(1);
    expect(targets.schoolsCount).toBe(1);
    expect(targets.missingEmail).toEqual(["Senza email", "Email vuota"]);
  });

  it("schoolsCount conta le SEDI, groups.length i TITOLARI", () => {
    // Le due cifre del modale: "Invita 2 titolari" · "3 autoscuole".
    const targets = affiliateInviteTargets([
      school({ schoolName: "A1", email: "a@example.it" }),
      school({ schoolName: "A2", email: "a@example.it" }),
      school({ schoolName: "B1", email: "b@example.it" }),
    ]);
    expect(targets.groups).toHaveLength(2);
    expect(targets.schoolsCount).toBe(3);
  });

  it("nessuna scuola da invitare = nessun gruppo", () => {
    expect(affiliateInviteTargets([])).toEqual({
      groups: [],
      schoolsCount: 0,
      missingEmail: [],
    });
  });
});
