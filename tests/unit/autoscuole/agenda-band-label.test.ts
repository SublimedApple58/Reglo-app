import { bandLabelStartMinutes, bandLocationLabel } from "@/lib/autoscuole/agenda-band-label";

const band = { startMinutes: 8 * 60, endMinutes: 11 * 60 };

describe("bandLabelStartMinutes", () => {
  it("fascia libera: il nome sta in testa", () => {
    expect(bandLabelStartMinutes(band, [], 1.2)).toBe(8 * 60);
  });

  it("guida all'inizio: scende nel primo tratto libero", () => {
    const occupied = [{ startMinutes: 8 * 60, endMinutes: 9 * 60 }];
    expect(bandLabelStartMinutes(band, occupied, 1.2)).toBe(9 * 60);
  });

  it("salta i buchi troppo bassi (sotto 16px)", () => {
    // 10 minuti a 1.2px = 12px: troppo poco, si va dopo la seconda guida.
    const occupied = [
      { startMinutes: 8 * 60, endMinutes: 9 * 60 },
      { startMinutes: 9 * 60 + 10, endMinutes: 10 * 60 },
    ];
    expect(bandLabelStartMinutes(band, occupied, 1.2)).toBe(10 * 60);
  });

  it("guide fuori dalla fascia non contano", () => {
    const occupied = [{ startMinutes: 6 * 60, endMinutes: 7 * 60 }];
    expect(bandLabelStartMinutes(band, occupied, 1.2)).toBe(8 * 60);
  });

  it("fascia tutta occupata: niente nome", () => {
    const occupied = [{ startMinutes: 7 * 60, endMinutes: 12 * 60 }];
    expect(bandLabelStartMinutes(band, occupied, 1.2)).toBeNull();
  });

  it("con lo zoom basso serve più tempo libero", () => {
    // 15 minuti: 18px a 1.2 (ok), 12.6px a 0.84 (70%: no).
    const occupied = [{ startMinutes: 8 * 60 + 15, endMinutes: 11 * 60 }];
    expect(bandLabelStartMinutes(band, occupied, 1.2)).toBe(8 * 60);
    expect(bandLabelStartMinutes(band, occupied, 0.84)).toBeNull();
  });
});

describe("bandLocationLabel", () => {
  it("nome del luogo o «Tutti i luoghi»", () => {
    expect(bandLocationLabel("Sede Bascinaella")).toBe("Sede Bascinaella");
    expect(bandLocationLabel(null)).toBe("Tutti i luoghi");
  });
});
