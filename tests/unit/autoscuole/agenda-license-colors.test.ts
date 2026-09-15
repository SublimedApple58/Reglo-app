import {
  LICENSE_COLOR_ENTRIES,
  LICENSE_COLOR_GROUPS,
  asAgendaColorOverrides,
  licenseColorEntryForTag,
  licenseLegendEntries,
  resolveColorOverride,
} from "@/lib/autoscuole/agenda-color-criterion";
import { LICENSE_CATEGORIES } from "@/lib/autoscuole/license";

describe("colori per patente (REG-461)", () => {
  it("ogni patente gestita da Reglo ha la sua voce colore", () => {
    const keys = new Set(LICENSE_COLOR_ENTRIES.map((e) => e.key));
    for (const category of LICENSE_CATEGORIES) {
      expect(keys.has(category.toLowerCase())).toBe(true);
      expect(licenseColorEntryForTag(category).key).toBe(category.toLowerCase());
    }
  });

  it("i gruppi del pannello coprono tutte le voci, una volta sola", () => {
    const grouped = LICENSE_COLOR_GROUPS.flatMap((g) => g.keys);
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual(LICENSE_COLOR_ENTRIES.map((e) => e.key).sort());
  });

  it("cambio automatico vince sulla categoria", () => {
    expect(licenseColorEntryForTag("CE autom.").key).toBe("autom");
  });

  it("le sotto-patenti ereditano il colore personalizzato della madre", () => {
    const ce = licenseColorEntryForTag("CE");
    expect(resolveColorOverride(ce, { c: "#AA0000" })).toBe("#AA0000");
    expect(resolveColorOverride(ce, { c: "#AA0000", ce: "#00AA00" })).toBe("#00AA00");
    expect(resolveColorOverride(licenseColorEntryForTag("ADR"), { c: "#AA0000" })).toBeNull();
  });

  it("gli override delle nuove voci passano la validazione", () => {
    expect(asAgendaColorOverrides({ patente: { cqc: "#123456", zz: "#123456" } })).toEqual({
      patente: { cqc: "#123456" },
    });
  });

  it("legenda: sotto-patenti con lo stesso colore fuse nella riga della madre", () => {
    const rows = licenseLegendEntries(undefined);
    const c = rows.find((r) => r.entry.key === "c");
    expect(c?.label).toBe("Patente C · CE · C1 · C1E · CQC");
    expect(rows.some((r) => r.entry.key === "ce")).toBe(false);

    const custom = licenseLegendEntries({ ce: "#00AA00" });
    expect(custom.find((r) => r.entry.key === "ce")?.overrideHex).toBe("#00AA00");
    expect(custom.find((r) => r.entry.key === "c")?.label).toBe("Patente C · C1 · C1E · CQC");
  });
});
