import {
  matchesPhaseFilter,
  STUDENT_PHASE_PILL_TONE,
  studentPhaseLabel,
} from "@/components/pages/Consorzio/student-phase";
import type { ConsorzioStudentPhase } from "@/lib/actions/consorzio.actions";

const ALL_PHASES: ConsorzioStudentPhase[] = ["AWAITING", "TEORIA", "PRATICA", "PATENTATO"];

describe("matchesPhaseFilter", () => {
  it('"Tutti" non filtra niente', () => {
    for (const phase of ALL_PHASES) {
      expect(matchesPhaseFilter(phase, "all")).toBe(true);
    }
  });

  it("separa i patentati da chi ha il percorso in corso", () => {
    expect(matchesPhaseFilter("PATENTATO", "patentati")).toBe(true);
    expect(matchesPhaseFilter("PRATICA", "patentati")).toBe(false);
    expect(matchesPhaseFilter("PRATICA", "pratica")).toBe(true);
    expect(matchesPhaseFilter("PATENTATO", "pratica")).toBe(false);
  });

  it("nessun allievo può sparire da entrambi i filtri", () => {
    // Le fasi teoria non sono raggiungibili su un consorzio, ma un dato
    // ereditato non deve rendere invisibile un allievo: la somma dei due
    // filtri copre sempre l'intero elenco.
    for (const phase of ALL_PHASES) {
      const visible =
        Number(matchesPhaseFilter(phase, "pratica")) +
        Number(matchesPhaseFilter(phase, "patentati"));
      expect(visible).toBe(1);
    }
  });
});

describe("presentazione della fase", () => {
  it("ogni fase ha un'etichetta e un tono, nessuna riga resta muta", () => {
    for (const phase of ALL_PHASES) {
      expect(studentPhaseLabel(phase)).toBeTruthy();
      expect(STUDENT_PHASE_PILL_TONE[phase]).toBeTruthy();
    }
  });

  it("le due fasi vere del consorzio si leggono come le chiama il filtro", () => {
    expect(studentPhaseLabel("PRATICA")).toBe("In pratica");
    expect(studentPhaseLabel("PATENTATO")).toBe("Patentato");
  });
});
