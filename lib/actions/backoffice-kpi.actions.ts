"use server";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { requireGlobalAdmin } from "@/lib/auth-guard";
import {
  SOURCE_BUCKETS,
  bucketKeyFor,
  bucketLabel,
  buildBuckets,
  companyKindOf,
  isCancelledStatus,
  isDoneStatus,
  pickBucketUnit,
  planMonthlyCents,
  sourceBucketOf,
  type KpiBucketUnit,
  type KpiCompanyKind,
} from "@/lib/backoffice/kpi-math";

// ───────────────────────────────────────────────────────────────────────────
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
    lessonsDone: KpiDelta;
    lessonsPerDay: KpiDelta;
    appShare: KpiDelta;
    activeInstructors: KpiDelta;
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

export async function getBackofficeKpis(input: z.infer<typeof rangeSchema>) {
  try {
    await requireGlobalAdmin();
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
        select: {
          id: true,
          name: true,
          createdAt: true,
          services: { select: { serviceKey: true, status: true, limits: true } },
        },
      }),
      prisma.companyPlan.findMany({
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
        where: { startsAt: inRange },
        select: {
          companyId: true,
          startsAt: true,
          status: true,
          type: true,
          studentId: true,
          instructorId: true,
        },
      }),
      // Guide PRENOTATE nel periodo → domanda e canale.
      prisma.autoscuolaAppointment.findMany({
        where: { createdAt: inRange },
        select: { companyId: true, createdAt: true, bookingSource: true },
      }),
      prisma.autoscuolaAppointment.findMany({
        where: { startsAt: inPrev },
        select: { status: true, instructorId: true },
      }),
      prisma.autoscuolaAppointment.findMany({
        where: { createdAt: inPrev },
        select: { bookingSource: true },
      }),
      prisma.companyMember.count({
        where: { autoscuolaRole: "STUDENT", createdAt: inRange },
      }),
      prisma.companyLicensePurchase.findMany({
        where: { purchasedAt: inRange },
        select: { seats: true, seatPriceCents: true },
      }),
      prisma.autoscuolaGroupLesson.groupBy({
        by: ["companyId"],
        where: { startsAt: inRange },
        _count: { _all: true },
      }),
      prisma.autoscuolaAppointmentEvaluation.findMany({
        where: { createdAt: inRange },
        select: { appointment: { select: { companyId: true } } },
      }),
      prisma.autoscuolaSwapOffer.groupBy({
        by: ["companyId"],
        where: { createdAt: inRange },
        _count: { _all: true },
      }),
      prisma.quizSession.groupBy({
        by: ["companyId"],
        where: { startedAt: inRange },
        _count: { _all: true },
      }),
      prisma.autoscuolaVoiceCall.groupBy({
        by: ["companyId"],
        where: { startedAt: inRange },
        _count: { _all: true },
      }),
      prisma.aulaLesson.groupBy({
        by: ["companyId"],
        where: { createdAt: inRange, companyId: { not: null } },
        _count: { _all: true },
      }),
      prisma.autoscuolaAppointmentPayment.groupBy({
        by: ["companyId"],
        where: { createdAt: inRange },
        _count: { _all: true },
      }),
      prisma.mobilePushDevice.findMany({
        where: { lastSeenAt: inRange, disabledAt: null },
        select: { platform: true, appVersion: true },
      }),
      // Crescita: SEMPRE ultimi 12 mesi, indipendente dal filtro (una curva di
      // crescita su "ultimi 7 giorni" non direbbe niente).
      prisma.company.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 366 * dayMs) } },
        select: { createdAt: true },
      }),
      prisma.companyPlan.findMany({
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
          lessonsDone: delta(lessonsDone, prevDone),
          lessonsPerDay: delta(lessonsDone / days, prevDone / days),
          appShare: delta(
            booked > 0 ? bookedFromApp / booked : 0,
            prevBooked > 0 ? prevApp / prevBooked : 0,
          ),
          activeInstructors: delta(activeInstructorIds.size, prevInstructorIds.size),
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
