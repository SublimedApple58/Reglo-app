import {
  buildReservedVehicles,
  effectiveEntryNotes,
  effectiveFollowVehicleId,
  resolveEntryConflicts,
  type BusyRow,
} from "@/lib/autoscuole/conflict-scan";

describe("buildReservedVehicles", () => {
  it("mette i mezzi nell'ordine in cui si racconta il conflitto", () => {
    expect(
      buildReservedVehicles({
        primaryVehicleId: "moto",
        extraMotoVehicleIds: ["moto2", "moto3"],
        followVehicleId: "polo",
      }),
    ).toEqual([
      { id: "moto", role: "primary" },
      { id: "moto2", role: "extra_moto" },
      { id: "moto3", role: "extra_moto" },
      { id: "polo", role: "follow" },
    ]);
  });

  it("salta quello che non c'è", () => {
    expect(buildReservedVehicles({ primaryVehicleId: "auto" })).toEqual([
      { id: "auto", role: "primary" },
    ]);
  });

  it("una guida senza veicoli non riserva niente", () => {
    expect(buildReservedVehicles({})).toEqual([]);
  });

  it("senza veicolo principale l'auto al seguito resta comunque riservata", () => {
    // Il backend lo vieta a monte (solo guide moto), ma l'elenco non deve
    // perdere pezzi per conto suo: chi lo usa decide cosa è lecito.
    expect(buildReservedVehicles({ followVehicleId: "polo" })).toEqual([
      { id: "polo", role: "follow" },
    ]);
  });
});

describe("effectiveFollowVehicleId", () => {
  it("assente eredita l'auto condivisa", () => {
    expect(effectiveFollowVehicleId("polo", undefined)).toBe("polo");
  });

  it("un id per la data vince su quello condiviso", () => {
    expect(effectiveFollowVehicleId("polo", "golf")).toBe("golf");
  });

  it("null è una scelta esplicita: nessuna auto al seguito", () => {
    expect(effectiveFollowVehicleId("polo", null)).toBeNull();
  });

  it("senza niente da nessuna delle due parti resta null", () => {
    expect(effectiveFollowVehicleId(undefined, undefined)).toBeNull();
    expect(effectiveFollowVehicleId(null, undefined)).toBeNull();
  });
});

/* ───────────────────── REG-616 — il conflitto fantasma ─────────────────────
 *
 * Le righe d'agenda si leggono una volta sola per TUTTE le date, con in OR
 * l'istruttore e l'unione dei mezzi di tutte quante. Fra quelle righe ce ne
 * sono che con una singola data non c'entrano: la guida di un collega, pescata
 * perche' usa l'auto al seguito che su QUESTA data abbiamo gia' sostituito.
 *
 * Prima bastava che una riga qualsiasi si sovrapponesse: non toccando i mezzi
 * di quella data, finiva nel ramo "allora e' l'istruttore". Risultato: la
 * schermata di riparazione diceva "scegli un'altra auto", l'utente la
 * sceglieva, e la creazione rispondeva "l'istruttore ha gia' un impegno" su un
 * istruttore che a quell'ora era libero. Prova a vuoto e creazione usano la
 * stessa funzione: con gli STESSI dati devono dare lo STESSO esito.
 */
const ORE = (h: number) => new Date(2026, 10, 23, h, 0, 0, 0);

const MOTO = "moto";
const POLO = "polo";
const GOLF = "golf";

/** La guida di un COLLEGA che tiene la POLO dalle 9 alle 10. */
const collegaConPolo: BusyRow = {
  startsAt: ORE(9),
  endsAt: ORE(10),
  ownInstructor: false,
  vehicleIds: [POLO],
};

const slot9 = (followVehicleId: string | null) => ({
  startsAt: ORE(9),
  endsAt: ORE(10),
  reserved: buildReservedVehicles({ primaryVehicleId: MOTO, followVehicleId }),
});

const resolve = (
  entries: ReturnType<typeof slot9>[],
  appointments: BusyRow[],
  containers: BusyRow[] = [],
) => resolveEntryConflicts({ entries, appointments, blocks: [], containers });

describe("resolveEntryConflicts — la riga di un altro", () => {
  it("con l'auto sostituita la data e' LIBERA (era 'istruttore occupato')", () => {
    expect(resolve([slot9(GOLF)], [collegaConPolo])).toEqual([null]);
  });

  it("con l'auto originale dice QUALE auto e' occupata", () => {
    expect(resolve([slot9(POLO)], [collegaConPolo])).toEqual([
      { kind: "vehicle", vehicleId: POLO, role: "follow", inGroupLesson: false },
    ]);
  });

  it("la stessa cosa vale per il container di una guida di gruppo", () => {
    const containerCollega: BusyRow = { ...collegaConPolo };
    expect(resolve([slot9(GOLF)], [], [containerCollega])).toEqual([null]);
    expect(resolve([slot9(POLO)], [], [containerCollega])).toEqual([
      { kind: "vehicle", vehicleId: POLO, role: "follow", inGroupLesson: true },
    ]);
  });
});

describe("resolveEntryConflicts — quando e' davvero l'istruttore", () => {
  it("una sua guida occupa l'ora, e cambiare auto non risolve", () => {
    const suaGuida: BusyRow = {
      startsAt: ORE(9),
      endsAt: ORE(10),
      ownInstructor: true,
      vehicleIds: ["altra-auto"],
    };
    expect(resolve([slot9(GOLF)], [suaGuida])).toEqual([
      { kind: "instructor", inGroupLesson: false },
    ]);
  });

  it("se usa anche un nostro mezzo, il motivo resta lui", () => {
    const suaGuidaConPolo: BusyRow = { ...collegaConPolo, ownInstructor: true };
    expect(resolve([slot9(POLO)], [suaGuidaConPolo])).toEqual([
      { kind: "instructor", inGroupLesson: false },
    ]);
  });

  it("l'istruttore occupato vince anche se la riga del collega viene prima", () => {
    const suaGuida: BusyRow = {
      startsAt: ORE(9),
      endsAt: ORE(10),
      ownInstructor: true,
      vehicleIds: [],
    };
    expect(resolve([slot9(POLO)], [collegaConPolo, suaGuida])).toEqual([
      { kind: "instructor", inGroupLesson: false },
    ]);
  });
});

describe("REG-616 — la riparazione deve reggere fino alla creazione", () => {
  // Lo scenario vero (dati di prova REG-608): la POLO BLU e' occupata da un
  // collega in tutte e tre le date; su ognuna si sceglie un'altra auto.
  const occupate: BusyRow[] = [9, 11, 15].map((h) => ({
    startsAt: ORE(h),
    endsAt: ORE(h + 1),
    ownInstructor: false,
    vehicleIds: [POLO],
  }));
  const tredate = (followVehicleId: string | null) =>
    [9, 11, 15].map((h) => ({
      startsAt: ORE(h),
      endsAt: ORE(h + 1),
      reserved: buildReservedVehicles({ primaryVehicleId: MOTO, followVehicleId }),
    }));

  it("con l'auto condivisa: tre volte la stessa auto occupata", () => {
    expect(
      resolveEntryConflicts({ entries: tredate(POLO), appointments: occupate, blocks: [], containers: [] }),
    ).toEqual([
      { kind: "vehicle", vehicleId: POLO, role: "follow", inGroupLesson: false },
      { kind: "vehicle", vehicleId: POLO, role: "follow", inGroupLesson: false },
      { kind: "vehicle", vehicleId: POLO, role: "follow", inGroupLesson: false },
    ]);
  });

  it("scelta l'auto sostitutiva, la creazione trova le stesse date libere", () => {
    expect(
      resolveEntryConflicts({ entries: tredate(GOLF), appointments: occupate, blocks: [], containers: [] }),
    ).toEqual([null, null, null]);
  });
});

describe("effectiveEntryNotes (REG-625)", () => {
  it("la nota della data sostituisce quella comune", () => {
    expect(effectiveEntryNotes("Portare il foglio rosa", "Parcheggio in salita")).toBe("Parcheggio in salita");
  });
  it("assente o vuota = eredita la nota comune", () => {
    expect(effectiveEntryNotes("Portare il foglio rosa", undefined)).toBe("Portare il foglio rosa");
    expect(effectiveEntryNotes("Portare il foglio rosa", "   ")).toBe("Portare il foglio rosa");
    expect(effectiveEntryNotes(undefined, undefined)).toBeNull();
    expect(effectiveEntryNotes("", null)).toBeNull();
  });
});
