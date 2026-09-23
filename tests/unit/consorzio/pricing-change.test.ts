import {
  diffConsorzioPricing,
  lateCancellationModeChanged,
  pricingAffectsPast,
} from "@/lib/consorzio/pricing-change";
import type { ConsorzioPricing } from "@/lib/consorzio/pricing";

const base: ConsorzioPricing = {
  hourlyByCategory: { CE: 110, C: 110 },
  billingModeByCategory: { CQC: "course" },
  courseByCategory: { CQC: 1250 },
  examFee: null,
  lateCancellationCutoffHours: 48,
  lateCancellationPenaltyPct: 100,
  lateCancellationMode: "percent",
  lateCancellationFixedAmount: 20,
  guideRequestMinLeadHours: 48,
};
const con = (over: Partial<ConsorzioPricing>): ConsorzioPricing => ({ ...base, ...over });

describe("diffConsorzioPricing", () => {
  it("un listino identico non produce nulla da chiedere", () => {
    expect(diffConsorzioPricing(base, con({}))).toEqual([]);
    expect(pricingAffectsPast(base, con({}))).toBe(false);
  });

  it("riconosce la tariffa esame che nasce dal nulla", () => {
    // È il caso di Tiziano: esame a 0 perché non impostato, poi 20 €.
    const changes = diffConsorzioPricing(base, con({ examFee: 20 }));
    expect(changes).toEqual([
      { key: "examFee", label: "Tariffa esame", from: null, to: 20, unit: "eur" },
    ]);
  });

  it("riconosce la tariffa oraria di UNA categoria, senza toccare le altre", () => {
    const changes = diffConsorzioPricing(base, con({ hourlyByCategory: { CE: 120, C: 110 } }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ key: "hourly:CE", from: 110, to: 120 });
  });

  it("riconosce il prezzo percorso", () => {
    const changes = diffConsorzioPricing(base, con({ courseByCategory: { CQC: 1400 } }));
    expect(changes[0]).toMatchObject({ key: "course:CQC", from: 1250, to: 1400 });
  });

  it("le penali sono tariffe come le altre", () => {
    // Deciso il 23/09: un'assenza addebitata è una voce di costo.
    expect(diffConsorzioPricing(base, con({ lateCancellationFixedAmount: 25 }))[0]).toMatchObject({
      key: "lateCancellationFixedAmount",
      from: 20,
      to: 25,
      unit: "eur",
    });
    expect(diffConsorzioPricing(base, con({ lateCancellationPenaltyPct: 50 }))[0]).toMatchObject({
      key: "lateCancellationPenaltyPct",
      unit: "pct",
    });
  });

  it("le REGOLE non sono tariffe: cambiarle non tocca nessun conto già fatto", () => {
    // Il cutoff decide SE un'assenza è addebitabile, il preavviso riguarda le
    // richieste: nessuna delle due rideterminata l'importo di una voce.
    expect(diffConsorzioPricing(base, con({ lateCancellationCutoffHours: 24 }))).toEqual([]);
    expect(diffConsorzioPricing(base, con({ guideRequestMinLeadHours: 24 }))).toEqual([]);
  });

  it("una tariffa tolta è un cambio quanto una aggiunta", () => {
    const changes = diffConsorzioPricing(con({ examFee: 20 }), base);
    expect(changes[0]).toMatchObject({ from: 20, to: null });
  });

  it("raccoglie più cambi insieme", () => {
    const changes = diffConsorzioPricing(
      base,
      con({ examFee: 20, hourlyByCategory: { CE: 120, C: 110 } }),
    );
    expect(changes.map((c) => c.key).sort()).toEqual(["examFee", "hourly:CE"]);
  });
});

describe("lateCancellationModeChanged", () => {
  it("cambiare criterio conta come cambio di tariffa", () => {
    // Percentuale ⇄ importo fisso non è una cifra, ma cambia il conto uguale.
    expect(lateCancellationModeChanged(base, con({ lateCancellationMode: "fixed" }))).toBe(true);
    expect(pricingAffectsPast(base, con({ lateCancellationMode: "fixed" }))).toBe(true);
  });

  it("stesso criterio, nessun cambio", () => {
    expect(lateCancellationModeChanged(base, con({}))).toBe(false);
  });
});
