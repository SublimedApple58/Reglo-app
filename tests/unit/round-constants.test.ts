import {
  milestonesAfterStatus,
  summarize,
  type FunnelInvestor,
  type Milestones,
} from "@/lib/round/round-constants";

const none: Milestones = {
  contactedOn: null,
  respondedOn: null,
  callOn: null,
  interestedOn: null,
  committedOn: null,
};

const inv = (over: Partial<FunnelInvestor>): FunnelInvestor => ({
  ...none,
  status: "da_contattare",
  category: "business_angel",
  excluded: false,
  commitmentCents: null,
  ...over,
});

describe("round pre-seed: tappe dell'imbuto", () => {
  it("uno stato aggiunge le tappe che implica, alla data data", () => {
    expect(milestonesAfterStatus(none, "call", "2026-10-20")).toEqual({
      ...none,
      contactedOn: "2026-10-20",
      respondedOn: "2026-10-20",
      callOn: "2026-10-20",
    });
  });

  it("non sposta le date già segnate e non toglie tappe se lo stato scende", () => {
    const afterCall = milestonesAfterStatus(none, "call", "2026-10-20");
    const afterNo = milestonesAfterStatus(afterCall, "no", "2026-10-25");
    expect(afterNo).toEqual(afterCall);
  });

  it("tornare indietro sul percorso principale toglie le tappe successive", () => {
    const afterResp = milestonesAfterStatus(none, "risposto", "2026-10-20");
    expect(milestonesAfterStatus(afterResp, "contattato", "2026-10-21")).toEqual({ ...none, contactedOn: "2026-10-20" });
  });

  it("una voce di storico aggiunge tappe e non ne toglie", () => {
    const afterCall = milestonesAfterStatus(none, "call", "2026-10-20");
    expect(milestonesAfterStatus(afterCall, "contattato", "2026-10-25", { onlyAdd: true })).toEqual(afterCall);
  });

  it("interessato dopo una call tiene la call", () => {
    const afterCall = milestonesAfterStatus(none, "call", "2026-10-20");
    const after = milestonesAfterStatus(afterCall, "interessato", "2026-10-23");
    expect(after.callOn).toBe("2026-10-20");
    expect(after.interestedOn).toBe("2026-10-23");
  });

  it("«Da contattare» è una correzione: azzera le tappe", () => {
    const afterCall = milestonesAfterStatus(none, "call", "2026-10-20");
    expect(milestonesAfterStatus(afterCall, "da_contattare", "2026-10-25")).toEqual(none);
  });

  it("bloccato e in pausa non implicano nessuna tappa", () => {
    expect(milestonesAfterStatus(none, "bloccato", "2026-10-20")).toEqual(none);
    expect(milestonesAfterStatus(none, "in_pausa", "2026-10-20")).toEqual(none);
  });
});

describe("round pre-seed: conteggi", () => {
  it("esclude gli esclusi da tutto tranne il loro contatore", () => {
    const s = summarize([
      inv({ status: "contattato", contactedOn: "2026-10-19" }),
      inv({ status: "call", contactedOn: "2026-10-19", respondedOn: "2026-10-20", callOn: "2026-10-20" }),
      inv({ status: "bloccato", category: "club_angel" }),
      inv({ status: "contattato", contactedOn: "2026-10-19", excluded: true }),
    ]);
    expect(s.total).toBe(3);
    expect(s.excluded).toBe(1);
    expect(s.byStatus.bloccato).toBe(1);
    expect(s.byCategory.club_angel.total).toBe(1);
  });

  it("somma l'impegno solo di chi è in «Impegno»", () => {
    const s = summarize([
      inv({ status: "impegno", commitmentCents: 5_000_000 }),
      inv({ status: "interessato", commitmentCents: 9_000_000 }),
    ]);
    expect(s.committedCents).toBe(5_000_000);
  });
});
