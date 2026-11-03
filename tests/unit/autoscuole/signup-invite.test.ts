jest.mock("@/db/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/autoscuole/member-locations", () => ({ getLocationAvailabilityState: jest.fn() }));

import { resolveSignupInviteCode, type SignupInviteDeps } from "@/lib/autoscuole/signup-invite";

const deps = (over: Partial<SignupInviteDeps> = {}): SignupInviteDeps => ({
  findCompany: jest.fn(async () => null),
  findInstructor: jest.fn(async () => null),
  findLocation: jest.fn(async () => null),
  locationModeEnabled: jest.fn(async () => true),
  ...over,
});

describe("resolveSignupInviteCode", () => {
  it("codice vuoto: non valido, nessuna ricerca", async () => {
    const d = deps();
    expect(await resolveSignupInviteCode("   ", d)).toBeNull();
    expect(d.findCompany).not.toHaveBeenCalled();
  });

  it("normalizza e cerca prima l'autoscuola", async () => {
    const d = deps({ findCompany: jest.fn(async () => ({ id: "c1" })) });
    expect(await resolveSignupInviteCode(" ab12cd ", d)).toEqual({
      companyId: "c1",
      assignedInstructorId: null,
      locationId: null,
    });
    expect(d.findCompany).toHaveBeenCalledWith("AB12CD");
    expect(d.findInstructor).not.toHaveBeenCalled();
    expect(d.findLocation).not.toHaveBeenCalled();
  });

  it("codice istruttore autonomo attivo: allievo nel suo gruppo", async () => {
    const d = deps({
      findInstructor: jest.fn(async () => ({ id: "i1", companyId: "c1", status: "active", autonomousMode: true })),
    });
    expect(await resolveSignupInviteCode("XYZ234", d)).toEqual({
      companyId: "c1",
      assignedInstructorId: "i1",
      locationId: null,
    });
    expect(d.findLocation).not.toHaveBeenCalled();
  });

  it("istruttore non autonomo: codice non valido (non ripiega sui luoghi)", async () => {
    const d = deps({
      findInstructor: jest.fn(async () => ({ id: "i1", companyId: "c1", status: "active", autonomousMode: false })),
    });
    expect(await resolveSignupInviteCode("XYZ234", d)).toBeNull();
    expect(d.findLocation).not.toHaveBeenCalled();
  });

  it("codice luogo con la funzione accesa: autoscuola + luogo", async () => {
    const d = deps({
      findLocation: jest.fn(async () => ({ id: "l1", companyId: "c1", archivedAt: null })),
    });
    expect(await resolveSignupInviteCode("LOT234", d)).toEqual({
      companyId: "c1",
      assignedInstructorId: null,
      locationId: "l1",
    });
    expect(d.locationModeEnabled).toHaveBeenCalledWith("c1");
  });

  it("codice luogo con la funzione spenta: non valido", async () => {
    const d = deps({
      findLocation: jest.fn(async () => ({ id: "l1", companyId: "c1", archivedAt: null })),
      locationModeEnabled: jest.fn(async () => false),
    });
    expect(await resolveSignupInviteCode("LOT234", d)).toBeNull();
  });

  it("luogo archiviato: non valido, senza guardare il setting", async () => {
    const d = deps({
      findLocation: jest.fn(async () => ({ id: "l1", companyId: "c1", archivedAt: new Date() })),
    });
    expect(await resolveSignupInviteCode("LOT234", d)).toBeNull();
    expect(d.locationModeEnabled).not.toHaveBeenCalled();
  });

  it("nessun codice corrisponde: non valido", async () => {
    expect(await resolveSignupInviteCode("NOPE99", deps())).toBeNull();
  });
});
