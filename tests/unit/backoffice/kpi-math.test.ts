import {
  SOURCE_BUCKETS,
  bucketKeyFor,
  buildBuckets,
  companyKindOf,
  isCancelledStatus,
  isDoneStatus,
  pickBucketUnit,
  planMonthlyCents,
  sourceBucketOf,
} from "@/lib/backoffice/kpi-math";

describe("KPI — granularità dei grafici", () => {
  it("passa da ore a giorni a settimane a mesi secondo il respiro del periodo", () => {
    expect(pickBucketUnit(1)).toBe("hour");
    expect(pickBucketUnit(2)).toBe("hour");
    expect(pickBucketUnit(7)).toBe("day");
    expect(pickBucketUnit(45)).toBe("day");
    expect(pickBucketUnit(90)).toBe("week");
    expect(pickBucketUnit(365)).toBe("month");
  });

  it("costruisce un bucket per giorno, estremo finale escluso", () => {
    const buckets = buildBuckets(new Date(2026, 8, 1), new Date(2026, 8, 8), "day");
    expect(buckets).toHaveLength(7);
    expect(buckets[0].start.getDate()).toBe(1);
    expect(buckets[6].start.getDate()).toBe(7);
  });

  it("aggancia le settimane al lunedì", () => {
    // 2026-09-13 è una domenica: cade nella settimana che inizia lunedì 7.
    const key = bucketKeyFor(new Date(2026, 8, 13, 15, 30), "week");
    expect(new Date(key).getDay()).toBe(1);
    expect(new Date(key).getDate()).toBe(7);
  });

  it("mette nello stesso bucket mensile due date dello stesso mese", () => {
    expect(bucketKeyFor(new Date(2026, 8, 1), "month")).toBe(
      bucketKeyFor(new Date(2026, 8, 30), "month"),
    );
  });
});

describe("KPI — esiti delle guide", () => {
  it("conta come svolte completate, check-in e da rivedere", () => {
    expect(isDoneStatus("completed")).toBe(true);
    expect(isDoneStatus("checked_in")).toBe(true);
    expect(isDoneStatus("pending_review")).toBe(true);
    expect(isDoneStatus("scheduled")).toBe(false);
    expect(isDoneStatus("cancelled")).toBe(false);
    expect(isDoneStatus(null)).toBe(false);
  });

  it("riconosce le annullate a prescindere dal case", () => {
    expect(isCancelledStatus("CANCELLED")).toBe(true);
    expect(isCancelledStatus("no_show")).toBe(false);
  });
});

describe("KPI — canale di prenotazione", () => {
  it("separa app allievo, staff e canali automatici", () => {
    expect(sourceBucketOf("student_self")).toBe("app");
    expect(sourceBucketOf("staff_owner")).toBe("staff");
    expect(sourceBucketOf("staff_instructor")).toBe("staff");
    expect(sourceBucketOf("group_lesson")).toBe("gruppo");
    expect(sourceBucketOf("exam")).toBe("esame");
    expect(sourceBucketOf("swap")).toBe("scambio");
    expect(sourceBucketOf("slot_fill")).toBe("scambio");
    expect(sourceBucketOf("voice")).toBe("voce");
  });

  it("manda nello storico le guide senza canale e i valori sconosciuti", () => {
    expect(sourceBucketOf(null)).toBe("altro");
    expect(sourceBucketOf("qualcosa_di_nuovo")).toBe("altro");
  });

  it("ha sempre un canale buono per ogni valore: l'ultimo prende tutto", () => {
    expect(SOURCE_BUCKETS[SOURCE_BUCKETS.length - 1].match(null)).toBe(true);
  });
});

describe("KPI — piani", () => {
  const base = {
    instructorSeats: 3,
    instructorSeatPriceCents: 10_000,
    voiceEnabled: false,
    voicePriceCents: 3_900,
  };

  it("normalizza l'annuale a mensile dividendo per dodici", () => {
    expect(planMonthlyCents({ ...base, billingPeriod: "annual" })).toBe(2_500);
  });

  it("lascia stare il mensile", () => {
    expect(planMonthlyCents({ ...base, billingPeriod: "monthly" })).toBe(30_000);
  });

  it("somma la Segretaria solo se attiva", () => {
    expect(planMonthlyCents({ ...base, billingPeriod: "monthly", voiceEnabled: true })).toBe(33_900);
  });
});

describe("KPI — tipo di account", () => {
  it("riconosce consorzio e solo-segretaria dai limits", () => {
    expect(companyKindOf({ accountKind: "consorzio" })).toBe("consorzio");
    expect(companyKindOf({ secretaryOnly: true })).toBe("segretaria");
  });

  it("tutto il resto è un'autoscuola normale", () => {
    expect(companyKindOf(null)).toBe("autoscuola");
    expect(companyKindOf({})).toBe("autoscuola");
    expect(companyKindOf({ secretaryOnly: false })).toBe("autoscuola");
  });
});
