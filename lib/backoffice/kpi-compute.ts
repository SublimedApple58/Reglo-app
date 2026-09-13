import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { buildAvailabilityResolver } from "@/lib/actions/autoscuole-availability.actions";
import {
  isStudentAppBookingEnabled,
  parseBookingGovernanceFromLimits,
} from "@/lib/autoscuole/booking-governance";
import {
  clampIntervals,
  instructorSaturation,
  romeWallClockToInstant,
  romeYmd,
  withRatio,
  type Interval,
} from "@/lib/backoffice/agenda-saturation";
import {
  SOURCE_BUCKETS,
  bucketKeyFor,
  bucketLabel,
  buildBuckets,
  companyKindOf,
  isCancelledStatus,
  isDoneStatus,
  isExcludedFromKpis,
  pickBucketUnit,
  planMonthlyCents,
  sourceBucketOf,
  type KpiBucketUnit,
  type KpiCompanyKind,
} from "@/lib/backoffice/kpi-math";

// ───────────────────────────────────────────────────────────────────────────
// Calcolo dei KPI. Modulo NON "use server": qui dentro non c'è nessuna guardia,
// quindi non deve mai diventare un server action richiamabile dal client. Chi lo
// usa mette la propria autorizzazione davanti (backoffice → requireGlobalAdmin,
// pagina investor → token del link).
//
// KPI del backoffice (sezione "KPI"): tutto calcolato LIVE, senza tabelle di
// rollup né job. I volumi sono minuscoli per una query analitica (~10k
// appuntamenti in totale, 14 autoscuole): aggregare al volo costa millisecondi
// ed evita un intero impianto di materializzazione da tenere in vita.
//
// Due orologi diversi, tenuti separati apposta:
// - `startsAt` → quando la guida SI SVOLGE (volume, esiti)
// - `createdAt` → quando è stata PRENOTATA (canale, domanda)
// Confonderli è l'errore classico di queste dashboard.
// ───────────────────────────────────────────────────────────────────────────

const rangeSchema = z.object({
  /** ISO date (YYYY-MM-DD) inclusa. */
  from: z.string().min(8),
  /** ISO date (YYYY-MM-DD) inclusa: internamente diventa fine giornata. */
  to: z.string().min(8),
});

export type KpiDelta = {
  current: number;
  previous: number;
} | null;

export type KpiCompanyRow = {
  id: string;
  name: string;
  kind: KpiCompanyKind;
  active: boolean;
  lessons: number;
  cancelled: number;
  activeStudents: number;
  /** Quota di prenotazioni fatte dall'allievo in app (0-1, null se 0 prenotazioni). */
  appShare: number | null;
  lastActivityAt: string | null;
};

export type KpiSeriesPoint = {
  /** Chiave ISO del bucket (inizio). */
  bucket: string;
  label: string;
  done: number;
  cancelled: number;
  booked: number;
};

export type KpiSourcePoint = {
  bucket: string;
  label: string;
  app: number;
  staff: number;
  gruppo: number;
  esame: number;
  scambio: number;
  voce: number;
  altro: number;
};

export type KpiFeatureRow = {
  key: string;
  label: string;
  description: string;
  companies: number;
  events: number;
};

export type KpiGrowthPoint = {
  month: string;
  label: string;
  newCompanies: number;
  /** MRR cumulato STIMATO: ogni piano conta dalla sua data di registrazione. */
  mrrCents: number;
};

export type BackofficeKpis = {
  range: {
    from: string;
    to: string;
    days: number;
    previousFrom: string;
    previousTo: string;
    unit: KpiBucketUnit;
  };
  headline: {
    mrrCents: number;
    arrCents: number;
    plansCovered: number;
    companiesTotal: number;
    activeCompanies: number;
    newCompanies: number;
    /** Autoscuole interne di prova tenute fuori da TUTTI i conteggi. */
    excludedCompanies: number;
    lessonsDone: KpiDelta;
    lessonsPerDay: KpiDelta;
    appShare: KpiDelta;
    activeInstructors: KpiDelta;
  };
  /** Saturazione dell'agenda istruttori nel periodo (ore occupate / dichiarate). */
  saturation: {
    availableHours: number;
    busyHours: number;
    outsideHours: number;
    ratio: KpiDelta;
    instructorsWithAvailability: number;
    /** Autoscuole entrate nel rapporto (hanno lavorato nel periodo). */
    companiesCounted: number;
    /** Autoscuole tenute fuori perché senza nemmeno una guida nel periodo. */
    companiesIdle: number;
    /** Lo stesso rapporto spaccato per prenotazione in app dell'allievo. */
    byAppBooking: {
      enabled: { ratio: number; companies: number };
      disabled: { ratio: number; companies: number };
    };
  };
  activity: {
    booked: KpiDelta;
    cancelled: number;
    noShow: number;
    cancelRate: number;
    activeStudents: number;
    newStudents: number;
    series: KpiSeriesPoint[];
    sources: KpiSourcePoint[];
    sourceTotals: Array<{ key: string; label: string; count: number }>;
  };
  revenue: {
    oneOffCents: number;
    oneOffCount: number;
    arpaCents: number;
    seatsSold: number;
    seatsUsed: number;
    growth: KpiGrowthPoint[];
  };
  companies: KpiCompanyRow[];
  features: KpiFeatureRow[];
  app: {
    devices: number;
    ios: number;
    android: number;
    versions: Array<{ version: string; count: number }>;
  };
};

// ── Date helpers ────────────────────────────────────────────────────────────

const startOfDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000`);
const endOfDayExclusive = (iso: string) => {
  const d = startOfDay(iso);
  d.setDate(d.getDate() + 1);
  return d;
};
const dayMs = 86_400_000;
const formatYmd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// ── Domain helpers ──────────────────────────────────────────────────────────

const delta = (current: number, previous: number): KpiDelta => ({ current, previous });

// ── Action ──────────────────────────────────────────────────────────────────

export async function computeKpis(input: z.infer<typeof rangeSchema>) {
  try {
    const { from: fromRaw, to: toRaw } = rangeSchema.parse(input);

    const from = startOfDay(fromRaw);
    const toExclusive = endOfDayExclusive(toRaw);
    if (toExclusive <= from) {
      return { success: false as const, message: "Intervallo non valido." };
    }
    const spanMs = toExclusive.getTime() - from.getTime();
    const days = Math.max(1, Math.round(spanMs / dayMs));
    const prevTo = from;
    const prevFrom = new Date(from.getTime() - spanMs);
    const unit = pickBucketUnit(days);

    // Autoscuole interne di prova: fuori da TUTTI i KPI (decisione di prodotto
    // 2026-09-13). Si leggono prima, così ogni query sotto nasce già ristretta.
    const services = await prisma.companyService.findMany({
      where: { serviceKey: "AUTOSCUOLE" },
      select: { companyId: true, limits: true },
    });
    const excludedCompanyIds = services
      .filter((service) => isExcludedFromKpis(service.limits))
      .map((service) => service.companyId);
    const notExcluded = excludedCompanyIds.length
      ? { companyId: { notIn: excludedCompanyIds } }
      : {};
    // Prenotazione in app per l'ALLIEVO, default di autoscuola (REG-426: gli
    // override per percorso patente e per cluster istruttore qui si ignorano —
    // per un KPI di piattaforma conta l'impostazione della scuola).
    const appBookingByCompany = new Map(
      services.map((service) => [
        service.companyId,
        isStudentAppBookingEnabled(
          parseBookingGovernanceFromLimits((service.limits ?? {}) as Record<string, unknown>),
        ),
      ]),
    );
    const isExcluded = (companyId: string | null) =>
      companyId !== null && excludedCompanyIds.includes(companyId);

    const inRange = { gte: from, lt: toExclusive };
    const inPrev = { gte: prevFrom, lt: prevTo };

    const [
      companies,
      plans,
      startedRows,
      createdRows,
      prevStartedRows,
      prevCreatedRows,
      newStudents,
      agendaInstructors,
      instructorBlocks,
      holidays,
      licensePurchases,
      groupLessons,
      evaluations,
      swaps,
      quizSessions,
      voiceCalls,
      aulaLessons,
      payments,
      devices,
      companiesLast12,
      plansForGrowth,
    ] = await Promise.all([
      prisma.company.findMany({
        where: excludedCompanyIds.length ? { id: { notIn: excludedCompanyIds } } : {},
        select: {
          id: true,
          name: true,
          createdAt: true,
          services: { select: { serviceKey: true, status: true, limits: true } },
        },
      }),
      prisma.companyPlan.findMany({
        where: notExcluded,
        select: {
          companyId: true,
          billingPeriod: true,
          instructorSeats: true,
          instructorSeatPriceCents: true,
          voiceEnabled: true,
          voicePriceCents: true,
        },
      }),
      // Guide che SI SVOLGONO nel periodo → volume ed esiti.
      prisma.autoscuolaAppointment.findMany({
        where: { startsAt: inRange, ...notExcluded },
        select: {
          companyId: true,
          startsAt: true,
          endsAt: true,
          status: true,
          type: true,
          studentId: true,
          instructorId: true,
        },
      }),
      // Guide PRENOTATE nel periodo → domanda e canale.
      prisma.autoscuolaAppointment.findMany({
        where: { createdAt: inRange, ...notExcluded },
        select: { companyId: true, createdAt: true, bookingSource: true },
      }),
      prisma.autoscuolaAppointment.findMany({
        where: { startsAt: inPrev, ...notExcluded },
        select: { status: true, instructorId: true, startsAt: true, endsAt: true },
      }),
      prisma.autoscuolaAppointment.findMany({
        where: { createdAt: inPrev, ...notExcluded },
        select: { bookingSource: true },
      }),
      prisma.companyMember.count({
        where: { autoscuolaRole: "STUDENT", createdAt: inRange, ...notExcluded },
      }),
      // Saturazione: istruttori che possono comparire in agenda (stesso filtro
      // di getInstructorAvailabilityForAgenda), blocchi e festivi del periodo.
      prisma.autoscuolaInstructor.findMany({
        where: {
          ...notExcluded,
          status: { not: "inactive" },
          userId: { not: null },
          user: {
            companyMembers: {
              some: { autoscuolaRole: { in: ["INSTRUCTOR", "INSTRUCTOR_OWNER"] } },
            },
          },
        },
        select: { id: true, companyId: true },
      }),
      prisma.autoscuolaInstructorBlock.findMany({
        where: { startsAt: { lt: toExclusive }, endsAt: { gt: prevFrom }, ...notExcluded },
        select: { instructorId: true, startsAt: true, endsAt: true },
      }),
      prisma.autoscuolaHoliday.findMany({
        where: { date: { gte: prevFrom, lte: toExclusive }, ...notExcluded },
        select: { companyId: true, date: true },
      }),
      prisma.companyLicensePurchase.findMany({
        where: { purchasedAt: inRange, ...notExcluded },
        select: { seats: true, seatPriceCents: true },
      }),
      prisma.autoscuolaGroupLesson.groupBy({
        by: ["companyId"],
        where: { startsAt: inRange, ...notExcluded },
        _count: { _all: true },
      }),
      prisma.autoscuolaAppointmentEvaluation.findMany({
        where: {
          createdAt: inRange,
          ...(excludedCompanyIds.length
            ? { appointment: { companyId: { notIn: excludedCompanyIds } } }
            : {}),
        },
        select: { appointment: { select: { companyId: true } } },
      }),
      prisma.autoscuolaSwapOffer.groupBy({
        by: ["companyId"],
        where: { createdAt: inRange, ...notExcluded },
        _count: { _all: true },
      }),
      prisma.quizSession.groupBy({
        by: ["companyId"],
        where: { startedAt: inRange, ...notExcluded },
        _count: { _all: true },
      }),
      prisma.autoscuolaVoiceCall.groupBy({
        by: ["companyId"],
        where: { startedAt: inRange, ...notExcluded },
        _count: { _all: true },
      }),
      prisma.aulaLesson.groupBy({
        by: ["companyId"],
        where: excludedCompanyIds.length
          ? { createdAt: inRange, companyId: { not: null, notIn: excludedCompanyIds } }
          : { createdAt: inRange, companyId: { not: null } },
        _count: { _all: true },
      }),
      prisma.autoscuolaAppointmentPayment.groupBy({
        by: ["companyId"],
        where: { createdAt: inRange, ...notExcluded },
        _count: { _all: true },
      }),
      prisma.mobilePushDevice.findMany({
        where: { lastSeenAt: inRange, disabledAt: null, ...notExcluded },
        select: { platform: true, appVersion: true },
      }),
      // Crescita: SEMPRE ultimi 12 mesi, indipendente dal filtro (una curva di
      // crescita su "ultimi 7 giorni" non direbbe niente).
      prisma.company.findMany({
        where: {
          createdAt: { gte: new Date(Date.now() - 366 * dayMs) },
          ...(excludedCompanyIds.length ? { id: { notIn: excludedCompanyIds } } : {}),
        },
        select: { createdAt: true },
      }),
      prisma.companyPlan.findMany({
        where: notExcluded,
        select: {
          createdAt: true,
          billingPeriod: true,
          instructorSeats: true,
          instructorSeatPriceCents: true,
          voiceEnabled: true,
          voicePriceCents: true,
        },
      }),
    ]);

    // ── Autoscuole ────────────────────────────────────────────────────────
    const serviceOf = (c: (typeof companies)[number]) =>
      c.services.find((s) => s.serviceKey === "AUTOSCUOLE");
    const activeCompanies = companies.filter((c) => serviceOf(c)?.status === "ACTIVE");
    const newCompanies = companies.filter(
      (c) => c.createdAt >= from && c.createdAt < toExclusive,
    ).length;

    // ── Piani / MRR ───────────────────────────────────────────────────────
    const mrrCents = plans.reduce((sum, p) => sum + planMonthlyCents(p), 0);
    const payingCompanies = plans.filter((p) => planMonthlyCents(p) > 0).length;

    // ── Attività nel periodo ──────────────────────────────────────────────
    const buckets = buildBuckets(from, toExclusive, unit);
    const seriesMap = new Map<string, KpiSeriesPoint>();
    const sourceMap = new Map<string, KpiSourcePoint>();
    for (const b of buckets) {
      seriesMap.set(b.key, { bucket: b.key, label: b.label, done: 0, cancelled: 0, booked: 0 });
      sourceMap.set(b.key, {
        bucket: b.key,
        label: b.label,
        app: 0, staff: 0, gruppo: 0, esame: 0, scambio: 0, voce: 0, altro: 0,
      });
    }

    let lessonsDone = 0;
    let cancelled = 0;
    let noShow = 0;
    const activeStudentIds = new Set<string>();
    const activeInstructorIds = new Set<string>();
    const perCompany = new Map<
      string,
      { lessons: number; cancelled: number; students: Set<string>; last: Date | null; booked: number; app: number }
    >();
    const companyStat = (id: string) => {
      let entry = perCompany.get(id);
      if (!entry) {
        entry = { lessons: 0, cancelled: 0, students: new Set(), last: null, booked: 0, app: 0 };
        perCompany.set(id, entry);
      }
      return entry;
    };

    for (const row of startedRows) {
      const key = bucketKeyFor(row.startsAt, unit);
      const point = seriesMap.get(key);
      const stat = companyStat(row.companyId);
      const status = (row.status ?? "").toLowerCase();
      if (isCancelledStatus(status)) {
        cancelled += 1;
        stat.cancelled += 1;
        if (point) point.cancelled += 1;
        continue;
      }
      if (status === "no_show") noShow += 1;
      if (isDoneStatus(status)) {
        lessonsDone += 1;
        stat.lessons += 1;
        if (point) point.done += 1;
        if (row.studentId) activeStudentIds.add(row.studentId);
        if (row.instructorId) activeInstructorIds.add(row.instructorId);
        stat.students.add(row.studentId ?? "");
        if (!stat.last || row.startsAt > stat.last) stat.last = row.startsAt;
      }
    }

    let booked = 0;
    let bookedFromApp = 0;
    const sourceTotals = new Map<string, number>();
    for (const row of createdRows) {
      booked += 1;
      const bucket = sourceBucketOf(row.bookingSource);
      sourceTotals.set(bucket, (sourceTotals.get(bucket) ?? 0) + 1);
      if (bucket === "app") bookedFromApp += 1;
      const key = bucketKeyFor(row.createdAt, unit);
      const point = seriesMap.get(key);
      if (point) point.booked += 1;
      const sourcePoint = sourceMap.get(key);
      if (sourcePoint) sourcePoint[bucket] += 1;
      const stat = companyStat(row.companyId);
      stat.booked += 1;
      if (bucket === "app") stat.app += 1;
    }

    // ── Periodo precedente (solo i numeri che è onesto confrontare) ────────
    let prevDone = 0;
    const prevInstructorIds = new Set<string>();
    for (const row of prevStartedRows) {
      const status = (row.status ?? "").toLowerCase();
      if (!isDoneStatus(status)) continue;
      prevDone += 1;
      if (row.instructorId) prevInstructorIds.add(row.instructorId);
    }
    let prevBooked = 0;
    let prevApp = 0;
    for (const row of prevCreatedRows) {
      prevBooked += 1;
      if (sourceBucketOf(row.bookingSource) === "app") prevApp += 1;
    }

    // ── Classifica autoscuole ─────────────────────────────────────────────
    const companyRows: KpiCompanyRow[] = companies
      .map((c) => {
        const stat = perCompany.get(c.id);
        const service = serviceOf(c);
        return {
          id: c.id,
          name: c.name,
          kind: companyKindOf(service?.limits),
          active: service?.status === "ACTIVE",
          lessons: stat?.lessons ?? 0,
          cancelled: stat?.cancelled ?? 0,
          activeStudents: stat ? stat.students.size : 0,
          appShare: stat && stat.booked > 0 ? stat.app / stat.booked : null,
          lastActivityAt: stat?.last ? stat.last.toISOString() : null,
        };
      })
      .sort((a, b) => b.lessons - a.lessons || a.name.localeCompare(b.name, "it"));

    // ── Adozione feature ──────────────────────────────────────────────────
    const evaluationCompanies = new Set(evaluations.map((e) => e.appointment.companyId));
    const examCompanies = new Set<string>();
    let examCount = 0;
    for (const row of startedRows) {
      if ((row.type ?? "") === "esame") {
        examCompanies.add(row.companyId);
        examCount += 1;
      }
    }
    const fromGroups = (
      rows: Array<{ companyId: string | null; _count: { _all: number } }>,
    ) => ({
      companies: new Set(rows.map((r) => r.companyId).filter(Boolean)).size,
      events: rows.reduce((n, r) => n + r._count._all, 0),
    });

    const features: KpiFeatureRow[] = [
      {
        key: "group",
        label: "Guide di gruppo",
        description: "Lezioni collettive create nel periodo",
        ...fromGroups(groupLessons),
      },
      {
        key: "exam",
        label: "Esami in agenda",
        description: "Appuntamenti di tipo esame",
        companies: examCompanies.size,
        events: examCount,
      },
      {
        key: "evaluation",
        label: "Pagellino",
        description: "Voti dati sulle guide",
        companies: evaluationCompanies.size,
        events: evaluations.length,
      },
      {
        key: "swap",
        label: "Scambi guida",
        description: "Offerte di scambio inviate",
        ...fromGroups(swaps),
      },
      {
        key: "quiz",
        label: "Quiz teoria",
        description: "Sessioni quiz avviate",
        ...fromGroups(quizSessions),
      },
      {
        key: "voice",
        label: "Segretaria AI",
        description: "Chiamate gestite dal centralino",
        ...fromGroups(voiceCalls),
      },
      {
        key: "aula",
        label: "Reglo Aula",
        description: "Lezioni d'aula caricate",
        ...fromGroups(aulaLessons),
      },
      {
        key: "payments",
        label: "Pagamenti guide",
        description: "Incassi registrati sulle guide",
        ...fromGroups(payments),
      },
    ].sort((a, b) => b.companies - a.companies || b.events - a.events);

    // ── Parco app ─────────────────────────────────────────────────────────
    const versionCounts = new Map<string, number>();
    let ios = 0;
    let android = 0;
    for (const device of devices) {
      if (device.platform === "ios") ios += 1;
      else if (device.platform === "android") android += 1;
      const version = device.appVersion?.trim() || "sconosciuta";
      versionCounts.set(version, (versionCounts.get(version) ?? 0) + 1);
    }

    // ── Crescita (ultimi 12 mesi) ─────────────────────────────────────────
    const growth: KpiGrowthPoint[] = [];
    const firstMonth = new Date();
    firstMonth.setDate(1);
    firstMonth.setHours(0, 0, 0, 0);
    firstMonth.setMonth(firstMonth.getMonth() - 11);
    for (let i = 0; i < 12; i += 1) {
      const monthStart = new Date(firstMonth);
      monthStart.setMonth(firstMonth.getMonth() + i);
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthStart.getMonth() + 1);
      growth.push({
        month: monthStart.toISOString(),
        label: bucketLabel(monthStart, "month"),
        newCompanies: companiesLast12.filter(
          (c) => c.createdAt >= monthStart && c.createdAt < monthEnd,
        ).length,
        // Stima: un piano contribuisce da quando è stato registrato in poi.
        mrrCents: plansForGrowth
          .filter((p) => p.createdAt < monthEnd)
          .reduce((sum, p) => sum + planMonthlyCents(p), 0),
      });
    }

    // ── Saturazione dell'agenda ───────────────────────────────────────────
    // Quante ore gli istruttori DICHIARANO disponibili in agenda e quante di
    // quelle ore sono davvero occupate da guide. Le fasce arrivano dallo stesso
    // risolutore dell'agenda (settimanale + eccezioni giornaliere), quindi il
    // numero è quello che il titolare vede a schermo. Dalle ore disponibili si
    // tolgono blocchi (malattia, ferie, teoria) e festivi dell'autoscuola: un
    // istruttore in ferie non è disponibile. Le guide fuori fascia restano
    // fuori dal rapporto ma vengono contate a parte.
    const instructorsByCompany = new Map<string, string[]>();
    for (const instructor of agendaInstructors) {
      if (isExcluded(instructor.companyId)) continue;
      const list = instructorsByCompany.get(instructor.companyId) ?? [];
      list.push(instructor.id);
      instructorsByCompany.set(instructor.companyId, list);
    }
    const blocksByInstructor = new Map<string, Interval[]>();
    for (const block of instructorBlocks) {
      const list = blocksByInstructor.get(block.instructorId) ?? [];
      list.push({ start: block.startsAt.getTime(), end: block.endsAt.getTime() });
      blocksByInstructor.set(block.instructorId, list);
    }
    const holidaysByCompany = new Map<string, Set<string>>();
    for (const holiday of holidays) {
      const set = holidaysByCompany.get(holiday.companyId) ?? new Set<string>();
      // `date` è una colonna DATE: la si legge in UTC per non slittare di un giorno.
      set.add(holiday.date.toISOString().slice(0, 10));
      holidaysByCompany.set(holiday.companyId, set);
    }

    /** Durata di una guida: 60 minuti quando manca `endsAt` (righe vecchie). */
    const lessonInterval = (row: { startsAt: Date; endsAt: Date | null }): Interval => {
      const start = row.startsAt.getTime();
      const end = row.endsAt ? row.endsAt.getTime() : start + 60 * 60_000;
      return { start, end: end > start ? end : start + 60 * 60_000 };
    };

    const availabilityResolvers = new Map(
      await Promise.all(
        Array.from(instructorsByCompany, async ([companyId, ids]) => {
          const resolver = await buildAvailabilityResolver(
            companyId,
            "instructor",
            ids,
            prevFrom,
            toExclusive,
          );
          return [companyId, resolver] as const;
        }),
      ),
    );

    // Il futuro non si misura: un'agenda piena di fasce dichiarate per domani
    // farebbe sembrare la piattaforma più vuota di quello che è. Si guarda solo
    // la parte di periodo già passata.
    const now = Date.now();

    const saturationFor = (
      windowStart: Date,
      windowEndRaw: Date,
      lessonRows: Array<{
        instructorId: string | null;
        status: string;
        startsAt: Date;
        endsAt: Date | null;
      }>,
    ) => {
      const windowEnd = new Date(Math.min(windowEndRaw.getTime(), now));
      if (windowEnd.getTime() <= windowStart.getTime()) {
        return {
          ...withRatio({ availableHours: 0, busyHours: 0, outsideHours: 0 }),
          withAvailability: 0,
          companiesCounted: 0,
          companiesIdle: 0,
          byAppBooking: {
            enabled: { ratio: 0, companies: 0 },
            disabled: { ratio: 0, companies: 0 },
          },
        };
      }
      const window: Interval = { start: windowStart.getTime(), end: windowEnd.getTime() };
      const lessonsByInstructor = new Map<string, Interval[]>();
      for (const row of lessonRows) {
        if (!row.instructorId || isCancelledStatus(row.status)) continue;
        const list = lessonsByInstructor.get(row.instructorId) ?? [];
        list.push(lessonInterval(row));
        lessonsByInstructor.set(row.instructorId, list);
      }

      // Un giorno alla volta, sul calendario ITALIANO: le fasce sono orari da
      // orologio, non istanti (il server gira a UTC).
      const days: Date[] = [];
      for (
        let cursor = windowStart.getTime();
        cursor < windowEnd.getTime();
        cursor += dayMs
      ) {
        days.push(new Date(cursor + dayMs / 2)); // mezzogiorno: immune all'ora legale
      }

      let available = 0;
      let busy = 0;
      let outside = 0;
      let withAvailability = 0;

      const perCompany = Array.from(instructorsByCompany, ([companyId, ids]) => {
          const resolver = availabilityResolvers.get(companyId)!;
          const closedDays = holidaysByCompany.get(companyId) ?? new Set<string>();
          const rows = ids.map((instructorId) => {
            const slots: Interval[] = [];
            for (const day of days) {
              const { year, month, day: dayOfMonth } = romeYmd(day);
              const ymd = `${year}-${String(month).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
              if (closedDays.has(ymd)) continue;
              const record = resolver.resolve(instructorId, day);
              if (!record) continue;
              const dow = new Date(
                romeWallClockToInstant(year, month, dayOfMonth, 12 * 60),
              ).getUTCDay();
              if (!record.daysOfWeek.includes(dow)) continue;
              for (const range of record.ranges) {
                slots.push({
                  start: romeWallClockToInstant(year, month, dayOfMonth, range.startMinutes),
                  end: romeWallClockToInstant(year, month, dayOfMonth, range.endMinutes),
                });
              }
            }
            const totals = instructorSaturation(
              clampIntervals(slots, window),
              clampIntervals(blocksByInstructor.get(instructorId) ?? [], window),
              clampIntervals(lessonsByInstructor.get(instructorId) ?? [], window),
            );
            return totals;
          });
          return { companyId, rows };
      });

      // Una scuola senza NEMMENO una guida nel periodo non ha "l'agenda vuota":
      // non sta usando l'agenda (appena entrata, oppure la tiene fuori da
      // Reglo). Le sue ore dichiarate falserebbero il rapporto verso il basso,
      // quindi resta fuori — e la pagina lo dichiara.
      let companiesCounted = 0;
      let companiesIdle = 0;
      const byApp = {
        enabled: { available: 0, busy: 0, companies: 0 },
        disabled: { available: 0, busy: 0, companies: 0 },
      };

      for (const { companyId, rows } of perCompany) {
        const companyBusy = rows.reduce((n, r) => n + r.busyHours + r.outsideHours, 0);
        const companyAvailable = rows.reduce((n, r) => n + r.availableHours, 0);
        if (companyBusy <= 0) {
          if (companyAvailable > 0) companiesIdle += 1;
          continue;
        }
        companiesCounted += 1;
        const bucket = appBookingByCompany.get(companyId) ? byApp.enabled : byApp.disabled;
        bucket.companies += 1;
        for (const totals of rows) {
          available += totals.availableHours;
          busy += totals.busyHours;
          outside += totals.outsideHours;
          bucket.available += totals.availableHours;
          bucket.busy += totals.busyHours;
          if (totals.availableHours > 0) withAvailability += 1;
        }
      }

      const share = (group: { available: number; busy: number }) =>
        group.available > 0 ? group.busy / group.available : 0;

      return {
        ...withRatio({
          availableHours: available,
          busyHours: busy,
          outsideHours: outside,
        }),
        withAvailability,
        companiesCounted,
        companiesIdle,
        byAppBooking: {
          enabled: { ratio: share(byApp.enabled), companies: byApp.enabled.companies },
          disabled: { ratio: share(byApp.disabled), companies: byApp.disabled.companies },
        },
      };
    };

    const saturationNow = saturationFor(from, toExclusive, startedRows);
    const saturationPrev = saturationFor(prevFrom, prevTo, prevStartedRows);

    const seatsSold = plans.reduce((n, p) => n + p.instructorSeats, 0);

    return {
      success: true as const,
      data: {
        range: {
          from: formatYmd(from),
          to: formatYmd(new Date(toExclusive.getTime() - dayMs)),
          days,
          previousFrom: formatYmd(prevFrom),
          previousTo: formatYmd(new Date(prevTo.getTime() - dayMs)),
          unit,
        },
        headline: {
          mrrCents,
          arrCents: mrrCents * 12,
          plansCovered: plans.length,
          companiesTotal: companies.length,
          activeCompanies: activeCompanies.length,
          newCompanies,
          excludedCompanies: excludedCompanyIds.length,
          lessonsDone: delta(lessonsDone, prevDone),
          lessonsPerDay: delta(lessonsDone / days, prevDone / days),
          appShare: delta(
            booked > 0 ? bookedFromApp / booked : 0,
            prevBooked > 0 ? prevApp / prevBooked : 0,
          ),
          activeInstructors: delta(activeInstructorIds.size, prevInstructorIds.size),
        },
        saturation: {
          availableHours: saturationNow.availableHours,
          busyHours: saturationNow.busyHours,
          outsideHours: saturationNow.outsideHours,
          ratio: delta(saturationNow.ratio, saturationPrev.ratio),
          instructorsWithAvailability: saturationNow.withAvailability,
          companiesCounted: saturationNow.companiesCounted,
          companiesIdle: saturationNow.companiesIdle,
          byAppBooking: saturationNow.byAppBooking,
        },
        activity: {
          booked: delta(booked, prevBooked),
          cancelled,
          noShow,
          cancelRate: lessonsDone + cancelled > 0 ? cancelled / (lessonsDone + cancelled) : 0,
          activeStudents: activeStudentIds.size,
          newStudents,
          series: buckets.map((b) => seriesMap.get(b.key)!),
          sources: buckets.map((b) => sourceMap.get(b.key)!),
          sourceTotals: SOURCE_BUCKETS.map((b) => ({
            key: b.key,
            label: b.label,
            count: sourceTotals.get(b.key) ?? 0,
          })).filter((row) => row.count > 0),
        },
        revenue: {
          oneOffCents: licensePurchases.reduce((n, p) => n + p.seats * p.seatPriceCents, 0),
          oneOffCount: licensePurchases.length,
          arpaCents: payingCompanies > 0 ? Math.round(mrrCents / payingCompanies) : 0,
          seatsSold,
          seatsUsed: activeInstructorIds.size,
          growth,
        },
        companies: companyRows,
        features,
        app: {
          devices: devices.length,
          ios,
          android,
          versions: Array.from(versionCounts, ([version, count]) => ({ version, count })).sort(
            (a, b) => b.count - a.count,
          ),
        },
      } satisfies BackofficeKpis,
    };
  } catch (error) {
    return { success: false as const, message: formatError(error) };
  }
}
