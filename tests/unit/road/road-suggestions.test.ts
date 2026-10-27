import { buildBriefing, rankSuggestions, type SuggestionCandidate } from "@/lib/autoscuole/road/suggestions";

const now = new Date("2026-10-28T13:32:00Z");
const day = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
const cand = (over: Partial<SuggestionCandidate> & { id: string }): SuggestionCandidate => ({
  name: over.id,
  licenseCategory: "B",
  withMe: 1,
  doneCount: 5,
  doneMinutes: 300,
  lastDoneAt: day(2),
  nextExamAt: null,
  agendaAt: null,
  ...over,
});

describe("Road tab: allievi suggeriti", () => {
  it("ordine: guida in agenda, esame vicino, fermo da più tempo, chi guidi più spesso", () => {
    const out = rankSuggestions(
      [
        cand({ id: "frequente", withMe: 9 }),
        cand({ id: "fermo10", lastDoneAt: day(10) }),
        cand({ id: "fermo20", lastDoneAt: day(20) }),
        cand({ id: "esame", nextExamAt: new Date("2026-11-12T08:00:00Z") }),
        cand({ id: "agenda", agendaAt: new Date("2026-10-28T13:30:00Z") }),
      ],
      now,
      5,
    );
    expect(out.map((s) => s.id)).toEqual(["agenda", "esame", "fermo20", "fermo10", "frequente"]);
    expect(out[0].reason).toBe("In agenda alle 14:30");
    expect(out[1].reason).toBe("Esame il 12 novembre");
    expect(out[2].reason).toBe("Nessuna guida da 20 giorni");
    expect(out[4].reason).toBe("6ª guida · ultima lunedì");
  });

  it("l'esame oltre i 30 giorni non conta come vicino", () => {
    const [s] = rankSuggestions([cand({ id: "x", nextExamAt: new Date("2027-01-10T08:00:00Z") })], now);
    expect(s.kind).toBe("frequent");
  });

  it("riga del foglio: patente, numero di guida, ore fatte", () => {
    const [s] = rankSuggestions([cand({ id: "x", doneCount: 13, doneMinutes: 660 })], now);
    expect(s.detail).toBe("Patente B · 14ª guida · 11 h fatte");
  });

  it("al massimo 3 volti", () => {
    expect(rankSuggestions([1, 2, 3, 4, 5].map((i) => cand({ id: `s${i}` })), now)).toHaveLength(3);
  });
});

describe("Road tab: briefing per voce", () => {
  const sessions = [1, 2, 3, 4, 5].map((i) => ({ id: `s${i}`, startedAt: day(i) }));
  const m = (sessionId: string, kind: string, sentiment: string | null, extra: Partial<{ street: string; note: string }> = {}) => ({
    sessionId,
    kind,
    label: kind === "stop" ? "Stop" : kind === "rotonda" ? "Rotonde" : "Parcheggio",
    street: extra.street ?? null,
    note: extra.note ?? null,
    sentiment,
    recordedAt: day(1),
  });

  it("riassume le voci che tornano e mette prima le cose da migliorare", () => {
    const b = buildBriefing(sessions, [
      m("s1", "stop", "bad"),
      m("s2", "stop", "bad"),
      m("s3", "stop", "bad"),
      m("s5", "stop", "bad"),
      m("s1", "rotonda", "good"),
      m("s2", "rotonda", "good"),
      m("s3", "rotonda", "good"),
    ])!;
    expect(b.title).toBe("Nelle ultime 5 guide");
    expect(b.lines[0]).toEqual({ kind: "stop", label: "Stop", tone: "bad", detail: "da migliorare 4 volte nelle ultime 5" });
    expect(b.lines[1]).toEqual({ kind: "rotonda", label: "Rotonde", tone: "good", detail: "fatta bene 3 volte di fila" });
  });

  it("con una sola guida racconta l'ultima volta (via o nota)", () => {
    const b = buildBriefing(sessions.slice(0, 1), [
      m("s1", "distanza", "bad", { street: "Corso Vittorio" }),
      m("s1", "parcheggio", "good", { note: "al primo tentativo" }),
    ])!;
    expect(b.title).toBe("L'ultima volta");
    expect(b.lines.map((l) => l.detail)).toEqual(["Corso Vittorio", "«al primo tentativo»"]);
  });

  it("niente segnalazioni → niente briefing", () => {
    expect(buildBriefing(sessions, [])).toBeNull();
    expect(buildBriefing([], [])).toBeNull();
  });
});
