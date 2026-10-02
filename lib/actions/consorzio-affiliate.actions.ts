"use server";

/**
 * Autoscuole consorziate come vere Company Reglo (REG-454).
 *
 * Fino a oggi una consorziata era solo un'anagrafica (`ConsorzioSchool`) dentro
 * la company del consorzio, con `linkedCompanyId` sempre null. Qui nasce il
 * collegamento: ogni consorziata diventa una Company registrata, contata fra le
 * autoscuole Reglo, col servizio AUTOSCUOLE **spento** finché non compra Reglo.
 *
 * I tre stati e il perché della doppia scrittura (`linkedCompanyId` +
 * `limits.affiliateOf`) stanno in `docs/features/consorzio.md`. In breve:
 * `ConsorzioSchool` è l'autorità, i `limits` sono la copia che il percorso di
 * lettura può consultare senza una query cross-company a ogni render.
 *
 * Guardie: le action di questo file sono **tutte** di backoffice
 * (`requireGlobalAdmin`) tranne quelle marcate "lato consorzio", che usano
 * `requireConsortium` e agiscono solo sulle scuole del consorzio chiamante.
 */

import { z } from "zod";
import { Prisma } from "@prisma/client";

import { prisma } from "@/db/prisma";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import { requireConsortium } from "@/lib/service-access";
import {
  AUTOSCUOLE_CACHE_SEGMENTS,
  invalidateAutoscuoleCache,
} from "@/lib/autoscuole/cache";
import { affiliateCompanyName } from "@/lib/consorzio/affiliate-name";
import { formatError } from "@/lib/utils";
import { isPlaceholderEmail } from "@/lib/users/placeholder-email";
import {
  siblingSchoolsForEmail,
  upsertOwnerInvite,
} from "@/lib/consorzio/affiliate-invites";
import {
  affiliateInviteTargets,
  type AffiliateAccessStatus,
} from "@/lib/consorzio/affiliate-invite-targets";
import { sendCompanyInviteEmail } from "@/email";
import { routing } from "@/i18n/routing";
import { SERVER_URL } from "@/lib/constants";
import crypto from "crypto";

/**
 * Stato dell'accesso del titolare di una consorziata. Definito nel modulo puro
 * `lib/consorzio/affiliate-invite-targets.ts` insieme alla regola di chi è "da
 * invitare", che lo legge: tenere i due a contatto è il punto.
 */
export type { AffiliateAccessStatus };

export type AffiliateSchoolRow = {
  schoolId: string;
  schoolName: string;
  city: string | null;
  email: string | null;
  status: string;
  accountingCode: string | null;
  studentsCount: number;
  /** Company collegata, se collegata. */
  companyId: string | null;
  companyName: string | null;
  /** true = ha comprato Reglo (servizio AUTOSCUOLE ACTIVE). */
  regloActive: boolean;
  access: AffiliateAccessStatus;
  /** Titolari che possono già accedere (nome + email). */
  owners: Array<{ name: string; email: string }>;
  /** Invito pendente/scaduto, per Reinvia e Copia link. */
  invite: { email: string; token: string; expiresAt: string; expired: boolean } | null;
  /**
   * Altre sedi dello stesso consorzio che condividono questa email: un invito
   * le copre tutte. Senza questa riga, un titolare con cinque sedi sembra
   * "invitato" su una sola e "da invitare" sulle altre quattro.
   */
  sharedWith: string[];
};

const schoolIdSchema = z.object({ schoolId: z.string().uuid() });

const linkSchema = z.object({
  schoolId: z.string().uuid(),
  companyId: z.string().uuid(),
});

const createSchema = z.object({
  schoolId: z.string().uuid(),
  /** Facoltativo: se assente si usa il nome dell'anagrafica in Title Case. */
  name: z.string().trim().min(2).max(120).optional(),
});

/* ────────────────────────────────────────────────────────────────────────────
 * Lettura condivisa
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Righe scuola + stato Reglo + stato accesso per un consorzio.
 *
 * Volutamente una sola funzione per backoffice e account consorzio: le due
 * viste mostrano la stessa verità, e un secondo calcolo sarebbe un secondo
 * posto dove sbagliare. Il chiamante decide cosa può fare con queste righe.
 */
async function readAffiliateSchoolRows(
  consorzioCompanyId: string,
): Promise<AffiliateSchoolRow[]> {
  const schools = await prisma.consorzioSchool.findMany({
    where: { consorzioCompanyId, status: { not: "removed" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      city: true,
      email: true,
      status: true,
      linkedCompanyId: true,
      accountingCode: { select: { code: true } },
      _count: { select: { members: true } },
    },
  });

  const companyIds = schools
    .map((school) => school.linkedCompanyId)
    .filter((id): id is string => Boolean(id));

  const [companies, invites] = await Promise.all([
    companyIds.length
      ? prisma.company.findMany({
          where: { id: { in: companyIds } },
          select: {
            id: true,
            name: true,
            services: { where: { serviceKey: "AUTOSCUOLE" }, select: { status: true } },
            members: {
              where: { role: "admin" },
              select: { user: { select: { name: true, email: true } } },
            },
          },
        })
      : [],
    companyIds.length
      ? prisma.companyInvite.findMany({
          where: { companyId: { in: companyIds }, status: "pending" },
          orderBy: { createdAt: "desc" },
          select: { companyId: true, email: true, token: true, expiresAt: true },
        })
      : [],
  ]);

  const companyById = new Map(companies.map((company) => [company.id, company]));
  const inviteByCompany = new Map<string, (typeof invites)[number]>();
  for (const invite of invites) {
    // Il più recente per company: è quello che "Reinvia" e "Copia link" usano.
    if (!inviteByCompany.has(invite.companyId)) inviteByCompany.set(invite.companyId, invite);
  }

  // Email → nomi delle scuole collegate che la condividono (vedi `sharedWith`).
  const schoolsByEmail = new Map<string, string[]>();
  for (const school of schools) {
    const email = (school.email ?? "").trim().toLowerCase();
    if (!email || !school.linkedCompanyId) continue;
    schoolsByEmail.set(email, [...(schoolsByEmail.get(email) ?? []), school.name]);
  }

  const now = Date.now();
  return schools.map((school) => {
    const company = school.linkedCompanyId
      ? companyById.get(school.linkedCompanyId)
      : undefined;
    const invite = school.linkedCompanyId
      ? inviteByCompany.get(school.linkedCompanyId)
      : undefined;
    const owners = (company?.members ?? [])
      .map((member) => ({
        name: member.user.name ?? "—",
        email: member.user.email ?? "",
      }))
      // Gli account segnaposto (@no-app.reglo.local) non sono accessi veri.
      .filter((owner) => owner.email && !isPlaceholderEmail(owner.email));

    const expired = invite ? invite.expiresAt.getTime() <= now : false;
    const access: AffiliateAccessStatus = !school.linkedCompanyId
      ? "not_linked"
      : owners.length > 0
        ? "active"
        : invite
          ? expired
            ? "expired"
            : "invited"
          : "not_invited";

    return {
      schoolId: school.id,
      schoolName: school.name,
      city: school.city,
      email: school.email,
      status: school.status,
      accountingCode: school.accountingCode?.code ?? null,
      studentsCount: school._count.members,
      companyId: school.linkedCompanyId,
      companyName: company?.name ?? null,
      regloActive: company?.services.some((service) => service.status === "ACTIVE") ?? false,
      access,
      owners,
      invite: invite
        ? {
            email: invite.email,
            token: invite.token,
            expiresAt: invite.expiresAt.toISOString(),
            expired,
          }
        : null,
      sharedWith: (schoolsByEmail.get((school.email ?? "").trim().toLowerCase()) ?? []).filter(
        (name) => name !== school.name,
      ),
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Backoffice
 * ────────────────────────────────────────────────────────────────────────── */

export async function getBackofficeConsorzioDetail(companyId: string) {
  try {
    await requireGlobalAdmin();

    const consorzio = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        services: { where: { serviceKey: "AUTOSCUOLE" }, select: { status: true, limits: true } },
      },
    });
    if (!consorzio) throw new Error("Consorzio non trovato.");

    const limits = (consorzio.services[0]?.limits ?? {}) as Record<string, unknown>;
    if (limits.accountKind !== "consorzio") {
      throw new Error("Questa company non è un consorzio.");
    }

    const schools = await readAffiliateSchoolRows(consorzio.id);

    return {
      success: true as const,
      data: {
        consorzio: {
          id: consorzio.id,
          name: consorzio.name,
          createdAt: consorzio.createdAt.toISOString(),
        },
        schools,
        totals: {
          schools: schools.length,
          linked: schools.filter((school) => school.companyId).length,
          regloActive: schools.filter((school) => school.regloActive).length,
          accessActive: schools.filter((school) => school.access === "active").length,
          notInvited: schools.filter((school) => school.access === "not_invited").length,
        },
      },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Company candidate al collegamento: autoscuole normali (non consorzi, non già
 * collegate ad un'altra scuola). Serve alla ricerca del dialog "Collega a
 * un'autoscuola esistente" per chi è GIÀ cliente Reglo.
 */
export async function searchLinkableCompanies(query: string) {
  try {
    await requireGlobalAdmin();
    const term = query.trim();

    const [companies, linked] = await Promise.all([
      prisma.company.findMany({
        where: term.length >= 2 ? { name: { contains: term, mode: "insensitive" } } : {},
        orderBy: { name: "asc" },
        take: 20,
        select: {
          id: true,
          name: true,
          services: { where: { serviceKey: "AUTOSCUOLE" }, select: { status: true, limits: true } },
        },
      }),
      prisma.consorzioSchool.findMany({
        where: { linkedCompanyId: { not: null } },
        select: { linkedCompanyId: true },
      }),
    ]);

    const alreadyLinked = new Set(
      linked.map((row) => row.linkedCompanyId).filter((id): id is string => Boolean(id)),
    );

    return {
      success: true as const,
      data: companies
        .filter((company) => {
          const limits = (company.services[0]?.limits ?? {}) as Record<string, unknown>;
          return limits.accountKind !== "consorzio" && !alreadyLinked.has(company.id);
        })
        .map((company) => ({
          id: company.id,
          name: company.name,
          regloActive: company.services.some((service) => service.status === "ACTIVE"),
        })),
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/** Scrive il collegamento nei due posti + invalida la cache delle due company. */
async function writeLink(input: {
  schoolId: string;
  companyId: string;
  consorzioCompanyId: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.consorzioSchool.update({
      where: { id: input.schoolId },
      data: { linkedCompanyId: input.companyId },
    });

    const service = await tx.companyService.findFirst({
      where: { companyId: input.companyId, serviceKey: "AUTOSCUOLE" },
      select: { id: true, limits: true },
    });
    const limits = {
      ...((service?.limits ?? {}) as Record<string, unknown>),
      affiliateOf: input.consorzioCompanyId,
    } as Prisma.InputJsonValue;

    if (service) {
      await tx.companyService.update({ where: { id: service.id }, data: { limits } });
    } else {
      // Nessuna riga di servizio = `isServiceActive` la considererebbe ATTIVA
      // (fallbackActive). Si crea sempre, e spenta.
      await tx.companyService.create({
        data: {
          companyId: input.companyId,
          serviceKey: "AUTOSCUOLE",
          status: "DISABLED",
          limits,
        },
      });
    }
  });

  await Promise.all([
    invalidateAutoscuoleCache({
      companyId: input.companyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS],
    }),
    invalidateAutoscuoleCache({
      companyId: input.consorzioCompanyId,
      segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS],
    }),
  ]);
}

export async function linkConsorzioSchoolToCompany(input: z.infer<typeof linkSchema>) {
  try {
    await requireGlobalAdmin();
    const payload = linkSchema.parse(input);

    const school = await prisma.consorzioSchool.findUnique({
      where: { id: payload.schoolId },
      select: { id: true, consorzioCompanyId: true, linkedCompanyId: true, status: true },
    });
    if (!school) throw new Error("Autoscuola consorziata non trovata.");
    if (school.status === "removed") throw new Error("Autoscuola rimossa dal consorzio.");
    if (school.linkedCompanyId && school.linkedCompanyId !== payload.companyId) {
      throw new Error("Questa consorziata è già collegata a un'altra autoscuola.");
    }
    if (payload.companyId === school.consorzioCompanyId) {
      throw new Error("Non si può collegare il consorzio a se stesso.");
    }

    const company = await prisma.company.findUnique({
      where: { id: payload.companyId },
      select: {
        id: true,
        services: { where: { serviceKey: "AUTOSCUOLE" }, select: { limits: true } },
      },
    });
    if (!company) throw new Error("Autoscuola non trovata.");
    const limits = (company.services[0]?.limits ?? {}) as Record<string, unknown>;
    if (limits.accountKind === "consorzio") {
      throw new Error("Un consorzio non può essere collegato come consorziata.");
    }

    const otherLink = await prisma.consorzioSchool.findFirst({
      where: { linkedCompanyId: payload.companyId, id: { not: payload.schoolId } },
      select: { id: true, name: true },
    });
    if (otherLink) {
      throw new Error(`Questa autoscuola è già collegata a "${otherLink.name}".`);
    }

    await writeLink({
      schoolId: school.id,
      companyId: payload.companyId,
      consorzioCompanyId: school.consorzioCompanyId,
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Crea la Company di una consorziata che non è ancora cliente Reglo: servizio
 * AUTOSCUOLE **spento**, sede di default, collegamento già fatto.
 *
 * Non crea nessun utente: le 37 anagrafiche in produzione hanno solo 24 email
 * distinte (una copre 5 sedi ODOS) e `User.email` è unique. Il titolare arriva
 * per invito, e un invito accettato può valere per più sedi dello stesso
 * titolare (un utente, più membership).
 */
export async function createAffiliateCompanyForSchool(
  input: z.infer<typeof createSchema>,
) {
  try {
    await requireGlobalAdmin();
    const payload = createSchema.parse(input);

    const school = await prisma.consorzioSchool.findUnique({
      where: { id: payload.schoolId },
      select: {
        id: true,
        name: true,
        consorzioCompanyId: true,
        linkedCompanyId: true,
        status: true,
      },
    });
    if (!school) throw new Error("Autoscuola consorziata non trovata.");
    if (school.status === "removed") throw new Error("Autoscuola rimossa dal consorzio.");
    if (school.linkedCompanyId) throw new Error("Questa consorziata è già collegata.");

    const created = await createAffiliateCompany(school, payload.name);
    return { success: true as const, data: created };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * La creazione vera e propria, senza guardie: la Company di una consorziata che
 * non ce l'ha ancora.
 *
 * La usano due percorsi — l'azione di backoffice qui sopra e **l'invito al
 * titolare**, che non può più fermarsi davanti a una scuola non collegata:
 * in produzione erano tutte e 37, e il consorzio non aveva modo di invitare
 * nessuno. Chi chiama controlla prima che la scuola esista, non sia rimossa e
 * non sia già collegata.
 */
async function createAffiliateCompany(
  school: { id: string; name: string; consorzioCompanyId: string },
  overrideName?: string,
): Promise<{ companyId: string; name: string }> {
  const name = overrideName?.trim() || affiliateCompanyName(school.name);

  const companyId = await prisma.$transaction(async (tx) => {
    const inviteCode = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
    const company = await tx.company.create({
      data: { name, inviteCode },
      select: { id: true },
    });

    await tx.companyService.create({
      data: {
        companyId: company.id,
        serviceKey: "AUTOSCUOLE",
        status: "DISABLED",
        limits: { affiliateOf: school.consorzioCompanyId } as Prisma.InputJsonValue,
      },
    });

    // Stessa forma della registrazione web: senza sede di default la scuola
    // non può creare niente il giorno in cui attiva Reglo.
    await tx.autoscuolaLocation.create({
      data: {
        companyId: company.id,
        name: `Sede ${name}`,
        isDefault: true,
        isPrecise: false,
      },
    });

    await tx.consorzioSchool.update({
      where: { id: school.id },
      data: { linkedCompanyId: company.id },
    });

    return company.id;
  });

  await invalidateAutoscuoleCache({
    companyId: school.consorzioCompanyId,
    segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS],
  });

  return { companyId, name };
}

/**
 * Scollega senza cancellare niente: la Company resta (con i suoi eventuali
 * allievi e guide), l'anagrafica resta, spariscono solo il puntatore e il flag.
 * Conseguenza voluta: se il servizio era spento, quella company torna al
 * cartello "Servizio non attivo" di sempre.
 */
export async function unlinkConsorzioSchool(input: z.infer<typeof schoolIdSchema>) {
  try {
    await requireGlobalAdmin();
    const payload = schoolIdSchema.parse(input);

    const school = await prisma.consorzioSchool.findUnique({
      where: { id: payload.schoolId },
      select: { id: true, consorzioCompanyId: true, linkedCompanyId: true },
    });
    if (!school) throw new Error("Autoscuola consorziata non trovata.");
    if (!school.linkedCompanyId) return { success: true as const };

    const linkedCompanyId = school.linkedCompanyId;

    await prisma.$transaction(async (tx) => {
      await tx.consorzioSchool.update({
        where: { id: school.id },
        data: { linkedCompanyId: null },
      });

      const service = await tx.companyService.findFirst({
        where: { companyId: linkedCompanyId, serviceKey: "AUTOSCUOLE" },
        select: { id: true, limits: true },
      });
      if (service) {
        const limits = { ...((service.limits ?? {}) as Record<string, unknown>) };
        delete limits.affiliateOf;
        await tx.companyService.update({
          where: { id: service.id },
          data: { limits: limits as Prisma.InputJsonValue },
        });
      }
    });

    await Promise.all([
      invalidateAutoscuoleCache({
        companyId: linkedCompanyId,
        segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS],
      }),
      invalidateAutoscuoleCache({
        companyId: school.consorzioCompanyId,
        segments: [AUTOSCUOLE_CACHE_SEGMENTS.SETTINGS],
      }),
    ]);

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lato consorzio
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Le stesse righe del backoffice, ma per l'account consorzio: serve alla
 * colonna "Accesso" della sezione Autoscuole e al blocco inviti del dettaglio
 * scuola. Il consorzio vede lo **stato** dell'accesso, mai una password.
 */
export async function listConsorzioSchoolsAccess() {
  try {
    const { membership } = await requireConsortium();
    const rows = await readAffiliateSchoolRows(membership.companyId);
    return { success: true as const, data: rows };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Inviti al titolare (backoffice E account consorzio)
 * ────────────────────────────────────────────────────────────────────────── */

const inviteSchema = z.object({
  schoolId: z.string().uuid(),
  /** Facoltativa: se assente si usa l'email dell'anagrafica. */
  email: z.string().email().optional(),
});

type InviteResult = {
  email: string;
  inviteUrl: string;
  expiresAt: string;
  /** Sedi coperte da questo invito (>1 quando il titolare ha più sedi). */
  schools: string[];
  emailSent: boolean;
};

/**
 * Prepara l'invito per tutte le sedi di quel titolare in quel consorzio e manda
 * UNA mail. Ritorna anche il link, che la UI offre come "Copia link": su
 * staging gli invii esterni sono no-op, e in generale quando la mail non arriva
 * il consorzio lo manda su WhatsApp.
 *
 * Se una di quelle sedi non ha ancora la sua Company, **la crea qui**
 * (`createAffiliateCompany`, servizio spento). Prima si fermava con "Collega
 * prima l'autoscuola a una Company Reglo", e il collegamento si poteva fare
 * solo dal backoffice una scuola alla volta: in produzione nessuna delle 37
 * consorziate era collegata, quindi nessun titolare era invitabile e il
 * pulsante "Invita i titolari non invitati" apriva un modale vuoto.
 */
async function sendOwnerInvite(input: {
  schoolId: string;
  email?: string;
  consorzioCompanyId: string;
  invitedById: string | null;
  invitedByName: string | null;
}): Promise<InviteResult> {
  const school = await prisma.consorzioSchool.findFirst({
    where: {
      id: input.schoolId,
      consorzioCompanyId: input.consorzioCompanyId,
      status: { not: "removed" },
    },
    select: {
      id: true,
      name: true,
      email: true,
      consorzioCompanyId: true,
      linkedCompanyId: true,
      linkedCompany: { select: { id: true, name: true } },
    },
  });
  if (!school) throw new Error("Autoscuola consorziata non trovata.");

  const email = (input.email ?? school.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("Questa autoscuola non ha un'email: inseriscila prima di invitare.");

  // Email cambiata dall'invito: si aggiorna l'anagrafica, altrimenti la
  // prossima volta ricomparirebbe quella vecchia precompilata.
  if (email !== (school.email ?? "").trim().toLowerCase()) {
    await prisma.consorzioSchool.update({ where: { id: school.id }, data: { email } });
  }

  const siblings = await siblingSchoolsForEmail({
    consorzioCompanyId: input.consorzioCompanyId,
    email,
  });
  // La scuola di partenza va per prima e c'è sempre, anche se l'email è appena
  // cambiata (e quindi `siblings` non la contiene).
  const sedi = [school, ...siblings.filter((sibling) => sibling.id !== school.id)];

  const targets = new Map<string, string>();
  let primaryCompanyId: string | null = null;
  let primaryCompanyName = school.linkedCompany?.name ?? null;
  for (const sede of sedi) {
    let companyId = sede.linkedCompanyId;
    if (!companyId) {
      const created = await createAffiliateCompany({
        id: sede.id,
        name: sede.name,
        consorzioCompanyId: school.consorzioCompanyId,
      });
      companyId = created.companyId;
      if (sede.id === school.id) primaryCompanyName = created.name;
    }
    targets.set(companyId, sede.name);
    if (sede.id === school.id) primaryCompanyId = companyId;
  }
  if (!primaryCompanyId) throw new Error("Autoscuola consorziata non collegabile.");

  let primary: { token: string; expiresAt: Date } | null = null;
  for (const companyId of targets.keys()) {
    const invite = await upsertOwnerInvite({
      companyId,
      email,
      invitedById: input.invitedById,
    });
    if (companyId === primaryCompanyId) {
      primary = { token: invite.token, expiresAt: invite.expiresAt };
    }
  }
  if (!primary) throw new Error("Invito non creato.");

  const inviteUrl = `${SERVER_URL}/${routing.defaultLocale}/invite/${primary.token}`;
  let emailSent = true;
  try {
    await sendCompanyInviteEmail({
      to: email,
      companyName: primaryCompanyName ?? school.name,
      inviteUrl,
      mobileInviteUrl: null,
      invitedByName: input.invitedByName,
    });
  } catch {
    // L'invito NON si annulla se la mail non parte: il link esiste e si copia.
    emailSent = false;
  }

  return {
    email,
    inviteUrl,
    expiresAt: primary.expiresAt.toISOString(),
    schools: Array.from(targets.values()),
    emailSent,
  };
}

export async function inviteAffiliateOwnerFromBackoffice(
  input: z.infer<typeof inviteSchema>,
) {
  try {
    await requireGlobalAdmin();
    const payload = inviteSchema.parse(input);

    const school = await prisma.consorzioSchool.findUnique({
      where: { id: payload.schoolId },
      select: { consorzioCompanyId: true },
    });
    if (!school) throw new Error("Autoscuola consorziata non trovata.");

    const data = await sendOwnerInvite({
      schoolId: payload.schoolId,
      email: payload.email,
      consorzioCompanyId: school.consorzioCompanyId,
      invitedById: null,
      invitedByName: "Reglo",
    });
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

export async function inviteAffiliateOwnerFromConsorzio(
  input: z.infer<typeof inviteSchema>,
) {
  try {
    const { membership, session } = await requireConsortium();
    const payload = inviteSchema.parse(input);

    const data = await sendOwnerInvite({
      schoolId: payload.schoolId,
      email: payload.email,
      consorzioCompanyId: membership.companyId,
      invitedById: membership.userId,
      invitedByName: session?.user?.name ?? null,
    });
    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Anteprima di "invita tutte le non invitate": gruppi per email, con le sedi di
 * ciascuno. È il dato che il dialogo mostra PRIMA della conferma esplicita —
 * sono mail vere verso clienti veri, non si mandano al buio.
 */
export async function previewBulkAffiliateInvites(consorzioCompanyId?: string) {
  try {
    let targetConsorzioId = consorzioCompanyId ?? null;
    if (targetConsorzioId) {
      await requireGlobalAdmin();
    } else {
      const { membership } = await requireConsortium();
      targetConsorzioId = membership.companyId;
    }

    const rows = await readAffiliateSchoolRows(targetConsorzioId);
    // Stessa regola del contatore sul pulsante: vedi
    // `lib/consorzio/affiliate-invite-targets.ts`.
    return { success: true as const, data: affiliateInviteTargets(rows) };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Manda gli inviti del gruppo preparato sopra: una mail per email distinta.
 * Gli errori non fermano il giro — si riporta chi è partito e chi no.
 */
export async function sendBulkAffiliateInvites(input: {
  consorzioCompanyId?: string;
  emails: string[];
}) {
  try {
    let targetConsorzioId = input.consorzioCompanyId ?? null;
    let invitedById: string | null = null;
    let invitedByName: string | null = "Reglo";
    if (targetConsorzioId) {
      await requireGlobalAdmin();
    } else {
      const { membership, session } = await requireConsortium();
      targetConsorzioId = membership.companyId;
      invitedById = membership.userId;
      invitedByName = session?.user?.name ?? null;
    }

    const wanted = new Set(input.emails.map((email) => email.trim().toLowerCase()));
    const rows = await readAffiliateSchoolRows(targetConsorzioId);
    // I gruppi che l'anteprima ha mostrato, ricalcolati qui: il client manda le
    // email, non chi può riceverle.
    const groups = affiliateInviteTargets(rows).groups.filter((group) =>
      wanted.has(group.email),
    );

    // Una mail per gruppo: `sendOwnerInvite` copre già tutte le sedi di quel
    // titolare, quindi basta partire da una qualsiasi.
    let sent = 0;
    const failed: string[] = [];
    for (const group of groups) {
      try {
        await sendOwnerInvite({
          schoolId: group.schoolIds[0],
          consorzioCompanyId: targetConsorzioId,
          invitedById,
          invitedByName,
        });
        sent += 1;
      } catch {
        failed.push(group.email);
      }
    }

    return { success: true as const, data: { sent, failed } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
