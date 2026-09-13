import {
  asAgendaInstructorOrder,
  sortInstructorsForAgenda,
} from "@/lib/autoscuole/agenda-instructor-order";

// Solferino, l'esempio della issue REG-449.
const DANIELE = { id: "i-dan", name: "Daniele" };
const EMIDIO = { id: "i-emi", name: "Emidio" };
const GIUSEPPE = { id: "i-giu", name: "Giuseppe" };
const ANDREA = { id: "i-and", name: "Andrea" };
const CESARE = { id: "i-ces", name: "Cesare" };
const ALL = [ANDREA, CESARE, DANIELE, EMIDIO, GIUSEPPE]; // come arrivano dal DB
const SOLFERINO = [DANIELE.id, EMIDIO.id, GIUSEPPE.id, ANDREA.id, CESARE.id];

const names = (list: Array<{ name: string }>) => list.map((i) => i.name);

describe("ordine istruttori in agenda — normalizzazione", () => {
  it("ripiega su lista vuota per valori non validi", () => {
    expect(asAgendaInstructorOrder(null)).toEqual([]);
    expect(asAgendaInstructorOrder(undefined)).toEqual([]);
    expect(asAgendaInstructorOrder("i-dan")).toEqual([]);
    expect(asAgendaInstructorOrder({ 0: "i-dan" })).toEqual([]);
  });

  it("scarta voci non-stringa, vuote e duplicate tenendo l'ordine", () => {
    expect(
      asAgendaInstructorOrder(["i-dan", 42, "", "  ", "i-emi", "i-dan", null]),
    ).toEqual(["i-dan", "i-emi"]);
  });
});

describe("ordine istruttori in agenda — ordinamento", () => {
  it("senza ordine custom resta l'alfabetico di prima", () => {
    expect(names(sortInstructorsForAgenda(ALL, []))).toEqual([
      "Andrea",
      "Cesare",
      "Daniele",
      "Emidio",
      "Giuseppe",
    ]);
  });

  it("rispetta l'ordine scelto dall'autoscuola", () => {
    expect(names(sortInstructorsForAgenda(ALL, SOLFERINO))).toEqual([
      "Daniele",
      "Emidio",
      "Giuseppe",
      "Andrea",
      "Cesare",
    ]);
  });

  it("un istruttore nuovo finisce in fondo, mai in mezzo né perso", () => {
    const nuovo = { id: "i-new", name: "Alberto" }; // alfabeticamente primo
    const list = sortInstructorsForAgenda([...ALL, nuovo], SOLFERINO);
    expect(names(list)).toEqual([
      "Daniele",
      "Emidio",
      "Giuseppe",
      "Andrea",
      "Cesare",
      "Alberto",
    ]);
  });

  it("più istruttori non ordinati restano fra loro in ordine alfabetico", () => {
    const parziale = [GIUSEPPE.id, DANIELE.id];
    expect(names(sortInstructorsForAgenda(ALL, parziale))).toEqual([
      "Giuseppe",
      "Daniele",
      "Andrea",
      "Cesare",
      "Emidio",
    ]);
  });

  it("ignora gli id di istruttori che non esistono più", () => {
    const conFantasma = ["i-ghost", ...SOLFERINO];
    expect(names(sortInstructorsForAgenda(ALL, conFantasma))).toEqual([
      "Daniele",
      "Emidio",
      "Giuseppe",
      "Andrea",
      "Cesare",
    ]);
  });

  it("non muta la lista in ingresso", () => {
    const input = [...ALL];
    sortInstructorsForAgenda(input, SOLFERINO);
    expect(names(input)).toEqual(names(ALL));
  });
});
