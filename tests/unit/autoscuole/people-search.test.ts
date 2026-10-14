import { foldForSearch, matchesPersonSearch } from "@/lib/autoscuole/people-search";

describe("foldForSearch", () => {
  it("toglie maiuscole e accenti", () => {
    expect(foldForSearch("Nicolò D'Amico")).toBe("nicolo d'amico");
  });

  it("e' idempotente: una forma gia' piatta non cambia", () => {
    expect(foldForSearch(foldForSearch("Ångström"))).toBe(foldForSearch("Ångström"));
  });
});

describe("matchesPersonSearch", () => {
  it("una ricerca vuota non filtra niente", () => {
    expect(matchesPersonSearch("Mario Rossi", "")).toBe(true);
    expect(matchesPersonSearch("Mario Rossi", "   ")).toBe(true);
  });

  it("non guarda le maiuscole", () => {
    expect(matchesPersonSearch("Mario Rossi", "MARIO")).toBe(true);
  });

  it("l'accento non e' un ostacolo, in nessuna delle due direzioni", () => {
    // Chi cerca su una tastiera del telefono scrive senza accento...
    expect(matchesPersonSearch("Nicolò Bianchi", "nicolo")).toBe(true);
    // ...e chi ce l'ha messo deve trovare comunque chi e' scritto senza.
    expect(matchesPersonSearch("Nicolo Bianchi", "nicolò")).toBe(true);
  });

  it("l'ordine di nome e cognome non conta", () => {
    // Il motivo per cui non e' un `includes` secco: la lista mostra
    // "Mario Rossi", ma chi cerca pensa al cognome per primo.
    expect(matchesPersonSearch("Mario Rossi", "rossi mario")).toBe(true);
  });

  it("basta l'inizio delle parole", () => {
    expect(matchesPersonSearch("Mario Rossi", "mar ros")).toBe(true);
  });

  it("gli spazi di troppo non rompono la ricerca", () => {
    expect(matchesPersonSearch("Mario Rossi", "  rossi   mario  ")).toBe(true);
  });

  it("una parola che non c'e' esclude la riga", () => {
    expect(matchesPersonSearch("Mario Rossi", "rossi marta")).toBe(false);
    expect(matchesPersonSearch("Mario Rossi", "verdi")).toBe(false);
  });
});
