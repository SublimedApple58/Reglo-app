import {
  normalizeSearchText,
  searchStudents,
  studentMatchesQuery,
} from "@/lib/consorzio/student-search";

const students = [
  { userId: "1", name: "Mario Rossi", schoolId: "a" },
  { userId: "2", name: "Maria Grazia Rossini", schoolId: "b" },
  { userId: "3", name: "Nicolò Bianchi", schoolId: "a" },
  { userId: "4", name: "Rossana Verdi", schoolId: "c" },
];

describe("REG-756 ricerca inversa allievo → autoscuola", () => {
  it("ignora maiuscole, accenti e spazi doppi", () => {
    expect(normalizeSearchText("  NICOLÒ   Bianchi ")).toBe("nicolo bianchi");
    expect(studentMatchesQuery("Nicolò Bianchi", "nicolo")).toBe(true);
  });

  it("trova nome e cognome in qualunque ordine", () => {
    expect(studentMatchesQuery("Mario Rossi", "rossi mario")).toBe(true);
    expect(studentMatchesQuery("Mario Rossi", "mario rossi")).toBe(true);
  });

  it("cerca per inizio di parola, non a metà", () => {
    expect(studentMatchesQuery("Mario Rossi", "ross")).toBe(true);
    expect(studentMatchesQuery("Mario Rossi", "ossi")).toBe(false);
  });

  it("su un nome composto ogni parola conta", () => {
    expect(studentMatchesQuery("Maria Grazia Rossini", "grazia rossini")).toBe(true);
    expect(studentMatchesQuery("Maria Grazia Rossini", "grazia verdi")).toBe(false);
  });

  it("query vuota: nessun allievo", () => {
    expect(searchStudents(students, "   ")).toEqual([]);
  });

  it("chi ha la parola intera viene prima, poi in ordine alfabetico", () => {
    expect(searchStudents(students, "rossi").map((s) => s.userId)).toEqual(["1", "2"]);
    expect(searchStudents(students, "ross").map((s) => s.userId)).toEqual(["2", "1", "4"]);
  });
});
