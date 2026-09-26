"use server";

/**
 * Cosa può fare un'autoscuola consorziata **senza Reglo** (REG-429).
 *
 * È la lista bianca: tutto il resto dell'app resta chiuso da
 * `requireServiceAccess`, che su servizio DISABLED rifiuta. Qui passano solo
 * le anagrafiche dei suoi allievi — l'unica cosa che la vista ridotta permette
 * di fare davvero (decisione di Tiziano, 26/09), perché senza un allievo in
 * anagrafica non si può nemmeno chiedere una guida al consorzio.
 *
 * **Gli allievi non nascono nella company della scuola**: nascono nella
 * company del CONSORZIO, taggati con `consorzioSchoolId`. È lì che vivono gli
 * allievi del consorzio da sempre (vedi docs/features/consorzio.md), è lì che
 * il consorzio li vede, ed è lì che la richiesta di guida andrà a cercarli.
 *
 * Ogni action passa da `requireAffiliateSchool`, che rilegge `ConsorzioSchool`
 * e restituisce lo `schoolId`: tutte le query restano filtrate su QUELLA
 * scuola, così due consorziate dello stesso consorzio non si vedono fra loro.
 */

import { z } from "zod";

import { prisma } from "@/db/prisma";
import { requireAffiliateSchool } from "@/lib/service-access";
import { buildPlaceholderEmail, displayEmail } from "@/lib/users/placeholder-email";
import { isLicenseCategory, isTransmission } from "@/lib/autoscuole/license";
import { parseConsorzioPricing } from "@/lib/consorzio/pricing";
import { guideRequestLeadTimeError } from "@/lib/consorzio/guide-request-lead";
import { createConsortiumGuideRequestNotification } from "@/lib/autoscuole/notifications";
import { formatError } from "@/lib/utils";
import crypto from "crypto";

/**
 * Riga allievo **nella stessa forma che usa la pagina Allievi vera**
 * (`AutoscuoleStudentsPage`): la vista ridotta monta quel componente, non una
 * pagina a parte. Cambia la sorgente — gli allievi stanno nella company del
 * consorzio, taggati con questa scuola — non il layout.
 */
export type AffiliateStudent = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  studentPhase: "AWAITING" | "TEORIA" | "PRATICA" | "PATENTATO";
  licenseCategory: string | null;
  transmission: string | null;
  activeCase: null;
  summary: {
    /** Guide già fatte col consorzio: la scuola vede il proprio storico. */
    completedLessons: number;
    requiredLessons: number;
    remaining: number;
    isCompleted: boolean;
  };
};

/** Come `parseNameParts` di autoscuole.actions: la lista mostra nome e cognome. */
const splitName = (name: string | null): { firstName: string; lastName: string } => {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "Allievo", lastName: "" };
  const [first, ...rest] = clean.split(" ");
  return { firstName: first, lastName: rest.join(" ") };
};

const STUDENT_PHASES = ["AWAITING", "TEORIA", "PRATICA", "PATENTATO"] as const;
const asPhase = (value: unknown): AffiliateStudent["studentPhase"] =>
  typeof value === "string" && (STUDENT_PHASES as readonly string[]).includes(value)
    ? (value as AffiliateStudent["studentPhase"])
    : "PRATICA";

const createSchema = z.object({
  firstName: z.string().trim().min(1, "Il nome è obbligatorio."),
  lastName: z.string().trim().min(1, "Il cognome è obbligatorio."),
  phone: z
    .string()
    .trim()
    .min(5, "Il telefono è obbligatorio.")
    .regex(/^[+()\-\s\d]{5,25}$/, "Numero di telefono non valido."),
  licenseCategory: z.string().trim().optional(),
  transmission: z.string().trim().optional(),
});

export async function listAffiliateStudents() {
  try {
    const { consorzioCompanyId, schoolId, schoolName } = await requireAffiliateSchool();

    const members = await prisma.companyMember.findMany({
      where: {
        companyId: consorzioCompanyId,
        consorzioSchoolId: schoolId,
        autoscuolaRole: "STUDENT",
      },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        licenseCategory: true,
        transmission: true,
        studentPhase: true,
        createdAt: true,
        user: { select: { name: true, email: true, phone: true } },
      },
    });

    const lessons = members.length
      ? await prisma.autoscuolaAppointment.groupBy({
          by: ["studentId"],
          where: {
            companyId: consorzioCompanyId,
            studentId: { in: members.map((member) => member.userId) },
            status: { not: "cancelled" },
          },
          _count: { _all: true },
        })
      : [];
    const lessonsByStudent = new Map(lessons.map((row) => [row.studentId, row._count._all]));

    return {
      success: true as const,
      data: {
        schoolName,
        students: members.map((member) => {
          const done = lessonsByStudent.get(member.userId) ?? 0;
          return {
            id: member.userId,
            ...splitName(member.user.name),
            email: displayEmail(member.user.email),
            phone: member.user.phone,
            status: "active",
            createdAt: member.createdAt.toISOString(),
            studentPhase: asPhase(member.studentPhase),
            licenseCategory: member.licenseCategory,
            transmission: member.transmission,
            activeCase: null,
            // `requiredLessons` è una regola dell'autoscuola con Reglo attivo:
            // qui resta 0 e la colonna dell'obbligo non si mostra.
            summary: {
              completedLessons: done,
              requiredLessons: 0,
              remaining: 0,
              isCompleted: false,
            },
          };
        }) satisfies AffiliateStudent[],
      },
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Anagrafica minima: nome, cognome, telefono. Niente email e niente password
 * — questi allievi non entrano in app (stesso trattamento degli allievi creati
 * dal consorzio, REG-464): l'account nasce con un'email segnaposto e
 * `password: null`, quindi non può accedere.
 */
export async function createAffiliateStudent(input: z.infer<typeof createSchema>) {
  try {
    const { consorzioCompanyId, schoolId, schoolSuspended } = await requireAffiliateSchool();
    if (schoolSuspended) {
      throw new Error("Autoscuola sospesa dal consorzio: contatta il consorzio.");
    }
    const payload = createSchema.parse(input);

    const school = await prisma.consorzioSchool.findUnique({
      where: { id: schoolId },
      select: { accountingCodeId: true },
    });

    const service = await prisma.companyService.findFirst({
      where: { companyId: consorzioCompanyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const limits = (service?.limits ?? {}) as Record<string, unknown>;
    const licenseCategory = isLicenseCategory(payload.licenseCategory)
      ? payload.licenseCategory
      : typeof limits.defaultLicenseCategory === "string"
        ? limits.defaultLicenseCategory
        : "B";
    const transmission = isTransmission(payload.transmission)
      ? payload.transmission
      : typeof limits.defaultTransmission === "string"
        ? limits.defaultTransmission
        : "manual";

    const name = `${payload.firstName} ${payload.lastName}`.replace(/\s+/g, " ").trim();

    const userId = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email: buildPlaceholderEmail(crypto.randomUUID()),
          password: null,
          phone: payload.phone,
          role: "user",
        },
        select: { id: true },
      });

      await tx.companyMember.create({
        data: {
          companyId: consorzioCompanyId,
          userId: user.id,
          role: "member",
          autoscuolaRole: "STUDENT",
          licenseCategory,
          transmission,
          consorzioSchoolId: schoolId,
        },
      });

      // Il codice contabile dell'autoscuola si propaga ai suoi allievi, come
      // fa `createCompanyUser` per quelli creati dal consorzio.
      if (school?.accountingCodeId) {
        await tx.consorzioMemberAccountingCode.create({
          data: {
            codeId: school.accountingCodeId,
            companyId: consorzioCompanyId,
            userId: user.id,
          },
        });
      }

      return user.id;
    });

    return { success: true as const, data: { userId } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const updatePhoneSchema = z.object({
  userId: z.string().uuid(),
  phone: z.string().trim().regex(/^[+()\-\s\d]{5,25}$/, "Numero di telefono non valido."),
});

export async function updateAffiliateStudentPhone(
  input: z.infer<typeof updatePhoneSchema>,
) {
  try {
    const { consorzioCompanyId, schoolId } = await requireAffiliateSchool();
    const payload = updatePhoneSchema.parse(input);

    // L'allievo deve essere di QUESTA scuola: senza questo controllo un
    // titolare potrebbe correggere il telefono di un allievo altrui.
    const member = await prisma.companyMember.findFirst({
      where: {
        companyId: consorzioCompanyId,
        userId: payload.userId,
        consorzioSchoolId: schoolId,
        autoscuolaRole: "STUDENT",
      },
      select: { userId: true },
    });
    if (!member) throw new Error("Allievo non trovato.");

    await prisma.user.update({
      where: { id: payload.userId },
      data: { phone: payload.phone },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

// ─── Richieste di guida al consorzio (REG-429 Fase 7) ───────

/**
 * Le richieste sono roba da **titolare**: è lui che tratta col consorzio e
 * risponde dei costi. Gli altri membri della consorziata (se mai ce ne
 * saranno: senza Reglo non si creano utenti) vedono l'agenda bloccata come
 * prima. L'interfaccia nasconde già la sezione, ma la porta la chiude qui —
 * un'interfaccia che nasconde non è un controllo.
 */
async function requireAffiliateOwner() {
  const context = await requireAffiliateSchool();
  if (
    context.membership.role !== "admin" &&
    context.membership.autoscuolaRole !== "OWNER"
  ) {
    throw new Error("Solo il titolare può gestire le richieste al consorzio.");
  }
  return context;
}

export type AffiliateAgendaSlot = {
  /** Colonna in cui cade il blocco. Null = impegno senza istruttore. */
  instructorId: string | null;
  startsAt: string;
  endsAt: string;
};

export type AffiliateGuideRequestRow = {
  id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  /** Slot in cui disegnare il blocco: quello accettato se la richiesta è stata spostata. */
  startsAt: string;
  requestedStartsAt: string;
  durationMinutes: number;
  studentName: string;
  vehicleName: string | null;
  /** Colonna: valorizzata solo quando il consorzio ha accettato e assegnato un istruttore. */
  instructorId: string | null;
  /** La richiesta è stata accettata su uno slot diverso da quello chiesto. */
  moved: boolean;
  /** Controproposta del consorzio ancora da confermare (oggi sola lettura). */
  proposedStartsAt: string | null;
  proposedDurationMinutes: number | null;
};

export type AffiliateAgendaData = {
  schoolName: string;
  schoolSuspended: boolean;
  /** Preavviso minimo del consorzio: serve al dialogo per bloccare gli slot troppo vicini. */
  minLeadHours: number;
  /** Colonne dell'agenda = istruttori del consorzio (gli stessi del prototipo). */
  instructors: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; name: string }>;
  /** Impegni del consorzio nella finestra: **solo orari**, nessun nome. */
  busy: AffiliateAgendaSlot[];
  requests: AffiliateGuideRequestRow[];
  /** La richiesta di `focusRequestId`, anche se fuori finestra. */
  focusRequest: AffiliateGuideRequestRow | null;
};

const agendaRangeSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  /**
   * Click-through dalla campanella: questa richiesta torna indietro anche se
   * cade fuori dalla settimana mostrata, così l'agenda può saltarci sopra
   * invece di aprire un dialogo vuoto.
   */
  focusRequestId: z.string().uuid().optional(),
});

const REQUEST_STATUSES = ["pending", "accepted", "rejected", "cancelled"] as const;
const asRequestStatus = (value: string): AffiliateGuideRequestRow["status"] =>
  (REQUEST_STATUSES as readonly string[]).includes(value)
    ? (value as AffiliateGuideRequestRow["status"])
    : "pending";

/**
 * L'agenda della consorziata in scope **Consorzio**: le proprie richieste nei
 * quattro stati, più gli slot già occupati dal consorzio.
 *
 * Gli occupati escono **senza nomi e senza tipo**: solo inizio, fine e colonna.
 * L'autoscuola deve sapere *quando* il consorzio è pieno per non chiedere uno
 * slot impossibile; chi ci sia dentro è affare del consorzio e delle altre
 * consorziate. È la stessa regola del prototipo (blocchi grigi "OCCUPATO") ed
 * è il motivo per cui questa query seleziona tre campi e non l'appuntamento.
 */
export async function getAffiliateAgenda(input: z.infer<typeof agendaRangeSchema>) {
  try {
    const { consorzioCompanyId, schoolId, schoolName, schoolSuspended } =
      await requireAffiliateOwner();
    const payload = agendaRangeSchema.parse(input);
    const from = new Date(payload.from);
    const to = new Date(payload.to);

    const [instructors, vehicles, service, requests] = await Promise.all([
      prisma.autoscuolaInstructor.findMany({
        where: { companyId: consorzioCompanyId, status: "active" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.autoscuolaVehicle.findMany({
        where: { companyId: consorzioCompanyId, status: "active" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.companyService.findFirst({
        where: { companyId: consorzioCompanyId, serviceKey: "AUTOSCUOLE" },
        select: { limits: true },
      }),
      prisma.consorzioGuideRequest.findMany({
        where: {
          consorzioCompanyId,
          schoolId,
          OR: [
            { requestedStartsAt: { gte: from, lt: to } },
            { movedToStartsAt: { gte: from, lt: to } },
          ],
        },
        orderBy: { requestedStartsAt: "asc" },
        include: {
          student: { select: { name: true } },
          vehicle: { select: { name: true } },
          appointment: { select: { instructorId: true, startsAt: true, endsAt: true } },
        },
      }),
    ]);

    // Le guide nate dalle richieste già accettate di QUESTA scuola si disegnano
    // dalla richiesta (verde "Confermata"): tenerle anche fra gli occupati
    // significherebbe due blocchi sovrapposti sullo stesso slot.
    const ownAppointmentIds = new Set(
      requests.map((request) => request.appointmentId).filter((id): id is string => !!id),
    );

    const busyRows = await prisma.autoscuolaAppointment.findMany({
      where: {
        companyId: consorzioCompanyId,
        status: { not: "cancelled" },
        startsAt: { lt: to },
        // `endsAt` è nullable (esami senza orario): quelli restano in finestra
        // se ci cade l'inizio.
        OR: [{ endsAt: { gt: from } }, { endsAt: null, startsAt: { gte: from } }],
      },
      // Tre campi: è il confine fra i due tenant, non un select da stringere dopo.
      select: { id: true, instructorId: true, startsAt: true, endsAt: true },
    });

    const data: AffiliateAgendaData = {
      schoolName,
      schoolSuspended,
      minLeadHours: parseConsorzioPricing(
        (service?.limits ?? {}) as Record<string, unknown>,
      ).guideRequestMinLeadHours,
      instructors,
      vehicles,
      busy: busyRows
        .filter((row) => !ownAppointmentIds.has(row.id))
        .map((row) => ({
          instructorId: row.instructorId,
          startsAt: row.startsAt.toISOString(),
          endsAt: (
            row.endsAt ?? new Date(row.startsAt.getTime() + 60 * 60000)
          ).toISOString(),
        })),
      requests: requests.map(toRequestRow),
      focusRequest: null,
    };

    if (payload.focusRequestId && !data.requests.some((r) => r.id === payload.focusRequestId)) {
      const extra = await prisma.consorzioGuideRequest.findFirst({
        where: { id: payload.focusRequestId, consorzioCompanyId, schoolId },
        include: {
          student: { select: { name: true } },
          vehicle: { select: { name: true } },
          appointment: { select: { instructorId: true, startsAt: true, endsAt: true } },
        },
      });
      if (extra) data.focusRequest = toRequestRow(extra);
    }

    return { success: true as const, data };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

type GuideRequestWithRelations = {
  id: string;
  status: string;
  requestedStartsAt: Date;
  durationMinutes: number;
  movedToStartsAt: Date | null;
  proposedStartsAt: Date | null;
  proposedDurationMinutes: number | null;
  student: { name: string | null };
  vehicle: { name: string } | null;
  appointment: { instructorId: string | null; startsAt: Date; endsAt: Date | null } | null;
};

const toRequestRow = (request: GuideRequestWithRelations): AffiliateGuideRequestRow => {
        const effectiveStart = request.appointment?.startsAt ?? request.requestedStartsAt;
        return {
          id: request.id,
          status: asRequestStatus(request.status),
          startsAt: effectiveStart.toISOString(),
          requestedStartsAt: request.requestedStartsAt.toISOString(),
          durationMinutes: request.appointment?.endsAt
            ? Math.max(
                15,
                Math.round(
                  (request.appointment.endsAt.getTime() -
                    request.appointment.startsAt.getTime()) /
                    60000,
                ),
              )
            : request.durationMinutes,
          studentName: request.student.name ?? "—",
          vehicleName: request.vehicle?.name ?? null,
          instructorId: request.appointment?.instructorId ?? null,
          moved: request.movedToStartsAt !== null,
          proposedStartsAt: request.proposedStartsAt?.toISOString() ?? null,
          proposedDurationMinutes: request.proposedDurationMinutes,
        };
};

const sendRequestSchema = z.object({
  studentUserId: z.string().uuid(),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(600),
  vehicleId: z.string().uuid().nullable(),
});

/**
 * Invia al consorzio la richiesta di guida: nasce `pending` e arriva nella
 * campanella del consorzio, che accetta / rifiuta / propone un altro orario
 * (`lib/actions/consorzio.actions.ts`).
 *
 * Il preavviso minimo (`guideRequestMinLeadHours`) si applica **qui**, all'atto
 * dell'invio, con lo stesso helper usato dal consorzio quando propone o sposta
 * uno slot: la regola è una sola e vale per chi lo slot lo sceglie.
 */
export async function sendAffiliateGuideRequest(
  input: z.infer<typeof sendRequestSchema>,
) {
  try {
    const { consorzioCompanyId, schoolId, schoolName, schoolSuspended } =
      await requireAffiliateOwner();
    if (schoolSuspended) {
      throw new Error("Autoscuola sospesa dal consorzio: contatta il consorzio.");
    }
    const payload = sendRequestSchema.parse(input);

    const student = await prisma.companyMember.findFirst({
      where: {
        companyId: consorzioCompanyId,
        userId: payload.studentUserId,
        consorzioSchoolId: schoolId,
        autoscuolaRole: "STUDENT",
      },
      select: { user: { select: { name: true } } },
    });
    if (!student) throw new Error("Allievo non trovato.");

    let vehicleName: string | null = null;
    if (payload.vehicleId) {
      const vehicle = await prisma.autoscuolaVehicle.findFirst({
        where: { id: payload.vehicleId, companyId: consorzioCompanyId },
        select: { name: true },
      });
      if (!vehicle) throw new Error("Veicolo non valido.");
      vehicleName = vehicle.name;
    }

    const service = await prisma.companyService.findFirst({
      where: { companyId: consorzioCompanyId, serviceKey: "AUTOSCUOLE" },
      select: { limits: true },
    });
    const startsAt = new Date(payload.startsAt);
    const leadError = guideRequestLeadTimeError(
      startsAt,
      parseConsorzioPricing((service?.limits ?? {}) as Record<string, unknown>)
        .guideRequestMinLeadHours,
    );
    if (leadError) throw new Error(leadError);

    const request = await prisma.consorzioGuideRequest.create({
      data: {
        consorzioCompanyId,
        schoolId,
        studentUserId: payload.studentUserId,
        requestedStartsAt: startsAt,
        durationMinutes: payload.durationMinutes,
        vehicleId: payload.vehicleId,
        status: "pending",
      },
      select: { id: true },
    });

    await createConsortiumGuideRequestNotification({
      companyId: consorzioCompanyId,
      requestId: request.id,
      studentName: student.user.name ?? "—",
      schoolName,
      vehicleName,
      startsAt,
    });

    return { success: true as const, data: { requestId: request.id } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

/**
 * Annulla una richiesta ancora in attesa. Se il consorzio l'ha già accettata la
 * guida esiste: disdirla è un'altra cosa (costi, penali) e passa dal consorzio.
 * La notifica in campanella viene rimossa: la richiesta non c'è più, e lasciare
 * lì una riga da gestire sarebbe solo lavoro inutile per il consorzio.
 */
export async function cancelAffiliateGuideRequest(requestId: string) {
  try {
    const { consorzioCompanyId, schoolId } = await requireAffiliateOwner();
    const id = z.string().uuid().parse(requestId);

    const request = await prisma.consorzioGuideRequest.findFirst({
      where: { id, consorzioCompanyId, schoolId },
      select: { id: true, status: true },
    });
    if (!request) throw new Error("Richiesta non trovata.");
    if (request.status !== "pending") {
      throw new Error(
        request.status === "accepted"
          ? "La richiesta è già stata accettata: per disdire la guida contatta il consorzio."
          : "Richiesta già gestita.",
      );
    }

    await prisma.consorzioGuideRequest.update({
      where: { id: request.id },
      data: { status: "cancelled", respondedAt: new Date() },
    });
    await prisma.autoscuolaNotification.deleteMany({
      where: {
        companyId: consorzioCompanyId,
        kind: "consortium_guide_request",
        meta: { path: ["requestId"], equals: request.id },
      },
    });

    return { success: true as const };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}

const respondProposalSchema = z.object({
  requestId: z.string().uuid(),
  accept: z.boolean(),
});

/**
 * L'autoscuola risponde alla **controproposta** del consorzio ("Proponi un
 * altro orario", REG-429 Fase 9).
 *
 * Accettando, la richiesta si sposta sullo slot proposto e **resta in attesa**:
 * l'appuntamento lo crea il consorzio, perché è lui a scegliere l'istruttore —
 * la proposta non ne contiene uno e inventarlo qui sarebbe peggio che
 * chiederglielo. Rifiutando, la proposta sparisce e resta la richiesta
 * originale. In entrambi i casi il consorzio se lo ritrova in campanella.
 */
export async function respondToAffiliateProposedSlot(
  input: z.infer<typeof respondProposalSchema>,
) {
  try {
    const { consorzioCompanyId, schoolId, schoolName } = await requireAffiliateOwner();
    const payload = respondProposalSchema.parse(input);

    const request = await prisma.consorzioGuideRequest.findFirst({
      where: { id: payload.requestId, consorzioCompanyId, schoolId },
      include: {
        student: { select: { name: true } },
        proposedVehicle: { select: { name: true } },
      },
    });
    if (!request) throw new Error("Richiesta non trovata.");
    if (request.status !== "pending") throw new Error("Richiesta già gestita.");
    if (!request.proposedStartsAt) throw new Error("Nessun orario proposto da confermare.");

    if (!payload.accept) {
      await prisma.consorzioGuideRequest.update({
        where: { id: request.id },
        data: {
          proposedStartsAt: null,
          proposedDurationMinutes: null,
          proposedVehicleId: null,
          proposedAt: null,
          proposedByUserId: null,
        },
      });
      return { success: true as const, data: { accepted: false } };
    }

    const startsAt = request.proposedStartsAt;
    await prisma.consorzioGuideRequest.update({
      where: { id: request.id },
      data: {
        requestedStartsAt: startsAt,
        durationMinutes: request.proposedDurationMinutes ?? request.durationMinutes,
        vehicleId: request.proposedVehicleId ?? request.vehicleId,
        proposedStartsAt: null,
        proposedDurationMinutes: null,
        proposedVehicleId: null,
        proposedAt: null,
        proposedByUserId: null,
      },
    });

    // Il consorzio deve accorgersene: la richiesta è di nuovo sul suo tavolo,
    // sullo slot che ha proposto lui.
    await prisma.autoscuolaNotification.deleteMany({
      where: {
        companyId: consorzioCompanyId,
        kind: "consortium_guide_request",
        meta: { path: ["requestId"], equals: request.id },
      },
    });
    await createConsortiumGuideRequestNotification({
      companyId: consorzioCompanyId,
      requestId: request.id,
      studentName: request.student.name ?? "—",
      schoolName,
      vehicleName: request.proposedVehicle?.name ?? null,
      startsAt,
    });

    return { success: true as const, data: { accepted: true } };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
