import {
  asStudentNameOrder,
  DEFAULT_STUDENT_NAME_ORDER,
  formatStudentName,
  formatStudentNameShort,
  sortStudentsByName,
} from "@/lib/autoscuole/student-name-order";

describe("asStudentNameOrder", () => {
  it("accetta i due valori noti", () => {
    expect(asStudentNameOrder("cognome_nome")).toBe("cognome_nome");
    expect(asStudentNameOrder("nome_cognome")).toBe("nome_cognome");
  });

  it("qualunque altra cosa ricade sul comportamento storico", () => {
    // Il default protegge le ~190 autoscuole che non hanno mai chiesto niente.
    for (const value of [undefined, null, "", "COGNOME_NOME", 42, {}, []]) {
      expect(asStudentNameOrder(value)).toBe("nome_cognome");
    }
    expect(DEFAULT_STUDENT_NAME_ORDER).toBe("nome_cognome");
  });
});

describe("formatStudentName", () => {
  const mario = { firstName: "Mario", lastName: "Rossi" };

  it("scrive nell'ordine scelto", () => {
    expect(formatStudentName(mario, "nome_cognome")).toBe("Mario Rossi");
    expect(formatStudentName(mario, "cognome_nome")).toBe("Rossi Mario");
  });

  it("senza ordine esplicito si comporta come prima", () => {
    expect(formatStudentName(mario)).toBe("Mario Rossi");
  });

  it("non lascia spazi orfani quando una parte manca", () => {
    // In agenda le guide di gruppo mettono l'etichetta nel nome e lasciano
    // vuoto il cognome: non deve uscire "Guida di gruppo · 2/3 " con lo spazio.
    const gruppo = { firstName: "Guida di gruppo · 2/3", lastName: "" };
    expect(formatStudentName(gruppo, "cognome_nome")).toBe("Guida di gruppo · 2/3");
    expect(formatStudentName(gruppo, "nome_cognome")).toBe("Guida di gruppo · 2/3");
    expect(formatStudentName({ firstName: "", lastName: "Rossi" }, "cognome_nome")).toBe("Rossi");
    expect(formatStudentName({ firstName: null, lastName: null })).toBe("");
  });
});

describe("formatStudentNameShort", () => {
  it("abbrevia la parte omessa, non quella per cui si ordina", () => {
    const mario = { firstName: "Mario", lastName: "Rossi" };
    expect(formatStudentNameShort(mario, "nome_cognome")).toBe("Mario R.");
    expect(formatStudentNameShort(mario, "cognome_nome")).toBe("Rossi M.");
  });

  it("con una parte sola non inventa un puntino", () => {
    expect(formatStudentNameShort({ firstName: "Gruppo", lastName: "" })).toBe("Gruppo");
  });
});

describe("sortStudentsByName", () => {
  const allievi = [
    { firstName: "Mario", lastName: "Verdi" },
    { firstName: "Anna", lastName: "Bianchi" },
    { firstName: "Luca", lastName: "Rossi" },
  ];

  it("per nome, quando si scrive NOME COGNOME", () => {
    expect(sortStudentsByName(allievi, "nome_cognome").map((s) => s.firstName)).toEqual([
      "Anna",
      "Luca",
      "Mario",
    ]);
  });

  it("per cognome, quando si scrive COGNOME NOME", () => {
    // È il punto della richiesta: chi legge "Rossi Luca" lo cerca alla R.
    expect(sortStudentsByName(allievi, "cognome_nome").map((s) => s.lastName)).toEqual([
      "Bianchi",
      "Rossi",
      "Verdi",
    ]);
  });

  it("a parità di cognome ordina per nome", () => {
    const rossi = [
      { firstName: "Zeno", lastName: "Rossi" },
      { firstName: "Aldo", lastName: "Rossi" },
    ];
    expect(sortStudentsByName(rossi, "cognome_nome").map((s) => s.firstName)).toEqual([
      "Aldo",
      "Zeno",
    ]);
  });

  it("ignora maiuscole e accenti, come fanno le anagrafiche vere", () => {
    // In produzione convivono "VERONICA BILIOTTI" e "Luca rubino".
    const misti = [
      { firstName: "Luca", lastName: "rubino" },
      { firstName: "Veronica", lastName: "BILIOTTI" },
      { firstName: "Ada", lastName: "Èvora" },
    ];
    expect(sortStudentsByName(misti, "cognome_nome").map((s) => s.lastName)).toEqual([
      "BILIOTTI",
      "Èvora",
      "rubino",
    ]);
  });

  it("non muta la lista in ingresso", () => {
    const originale = [...allievi];
    sortStudentsByName(allievi, "cognome_nome");
    expect(allievi).toEqual(originale);
  });
});
