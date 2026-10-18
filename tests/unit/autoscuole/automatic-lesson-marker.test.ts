import {
  AGENDA_COLOR_EXCEPTIONS,
  DEFAULT_AUTOMATIC_MARKER_COLOR,
  LICENSE_COLOR_ENTRIES,
  asAgendaColorOverrides,
  automaticMarkerStyle,
  resolveAutomaticLessonMarker,
} from "@/lib/autoscuole/agenda-color-criterion";

describe("contrassegno guide automatiche (REG-622)", () => {
  it("niente più colore dedicato: né eccezione né voce patente", () => {
    expect(AGENDA_COLOR_EXCEPTIONS.some((e) => e.key === "automatic")).toBe(false);
    expect(LICENSE_COLOR_ENTRIES.some((e) => e.key === "autom")).toBe(false);
  });

  it("acceso col nero standard per chi non ha mai toccato niente", () => {
    expect(resolveAutomaticLessonMarker({})).toEqual({ enabled: true, color: null });
    expect(resolveAutomaticLessonMarker(null)).toEqual({ enabled: true, color: null });
  });

  it("chi aveva spento l'eccezione automatica parte spento", () => {
    expect(
      resolveAutomaticLessonMarker({ agendaColorExceptions: { automatic: false, moto: true } }),
    ).toEqual({ enabled: false, color: null });
  });

  it("il colore scelto per l'automatico diventa il colore del bordo", () => {
    expect(
      resolveAutomaticLessonMarker({
        agendaColorOverrides: { patente: { autom: "#ec4899" } },
      }).color,
    ).toBe("#EC4899");
    // L'eccezione vince sulla voce patente.
    expect(
      resolveAutomaticLessonMarker({
        agendaColorOverrides: { eccezioni: { automatic: "#10B981" }, patente: { autom: "#EC4899" } },
      }).color,
    ).toBe("#10B981");
  });

  it("il setting salvato vince sull'eredità, anche il null del nero standard", () => {
    const legacy = {
      agendaColorExceptions: { automatic: false },
      agendaColorOverrides: { eccezioni: { automatic: "#10B981" } },
    };
    expect(
      resolveAutomaticLessonMarker({
        ...legacy,
        automaticLessonMarker: true,
        automaticLessonMarkerColor: null,
      }),
    ).toEqual({ enabled: true, color: null });
    expect(
      resolveAutomaticLessonMarker({ automaticLessonMarkerColor: "nonhex" }).color,
    ).toBeNull();
  });

  it("le chiavi vecchie non passano più la validazione degli override", () => {
    expect(
      asAgendaColorOverrides({ patente: { autom: "#123456", b: "#123456" }, eccezioni: { automatic: "#123456" } }),
    ).toEqual({ patente: { b: "#123456" } });
  });

  it("lo stile del bordo usa il nero se non c'è un colore", () => {
    expect(automaticMarkerStyle(null)).toEqual({ "--agenda-card-ring": DEFAULT_AUTOMATIC_MARKER_COLOR });
    expect(automaticMarkerStyle("#EC4899")).toEqual({ "--agenda-card-ring": "#EC4899" });
  });
});
