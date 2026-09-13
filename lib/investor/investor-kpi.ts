import { prisma } from "@/db/prisma";
import { computeKpis } from "@/lib/backoffice/kpi-compute";
import { DONE_STATUSES } from "@/lib/backoffice/kpi-math";
import {
  INVESTOR_PERIODS,
  projectInvestorKpis,
  type InvestorKpis,
  type InvestorPeriodKey,
} from "./investor-shape";

export * from "./investor-shape";

// ───────────────────────────────────────────────────────────────────────────
// Pagina "Reglo in numeri" (link investor). Stesso motore di calcolo del
// backoffice, ma con una PROIEZIONE ridotta: fuori tutto ciò che è operativo o
// che riguarda i singoli clienti.
//
// Cosa NON esce mai di qui (decisione di prodotto, 2026-09-13):
// - nomi delle autoscuole e classifica per attività → è riservatezza verso i
//   nostri clienti, non verso l'investor;
// - stato attivo/disattivato del singolo account;
// - tasso di annullamento, no show, versioni app installate → metriche
//   operative interne;
// - acquisti una tantum.
// ───────────────────────────────────────────────────────────────────────────

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * Numeri "dall'inizio": non dipendono dal periodo e raccontano la scala
 * raggiunta, che per un investor conta quanto la fotografia del mese.
 */
const allTimeTotals = async () => {
  const [lessons, students] = await Promise.all([
    prisma.autoscuolaAppointment.count({
      where: { status: { in: [...DONE_STATUSES] } },
    }),
    prisma.companyMember.count({ where: { autoscuolaRole: "STUDENT" } }),
  ]);
  return { lessons, students };
};

export async function buildInvestorKpis(
  periodKey: InvestorPeriodKey,
): Promise<InvestorKpis | null> {
  const period = INVESTOR_PERIODS.find((p) => p.key === periodKey) ?? INVESTOR_PERIODS[0];
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (period.days - 1));

  const [res, totals] = await Promise.all([
    computeKpis({ from: ymd(from), to: ymd(to) }),
    allTimeTotals(),
  ]);
  if (!res.success || !res.data) return null;
  return projectInvestorKpis(res.data, totals, period.key);
}

// ── Link ────────────────────────────────────────────────────────────────────

export type InvestorLinkState =
  | { ok: true; label: string }
  | { ok: false; reason: "unknown" | "revoked" | "expired" };

/**
 * Valida il token. `countView` segna la visita: va messo SOLO all'apertura
 * della pagina — cambiare il periodo dal filtro non è una visita nuova.
 * Un token sconosciuto e uno revocato danno pagine diverse solo nel testo:
 * in entrambi i casi zero dati.
 */
export async function resolveInvestorLink(
  token: string,
  { countView = true }: { countView?: boolean } = {},
): Promise<InvestorLinkState> {
  if (!token || token.length < 20 || token.length > 120) return { ok: false, reason: "unknown" };
  const link = await prisma.investorKpiLink.findUnique({
    where: { token },
    select: { id: true, label: true, revokedAt: true, expiresAt: true },
  });
  if (!link) return { ok: false, reason: "unknown" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  // Contatore visite: best-effort, non deve mai far fallire la pagina.
  if (countView) {
    prisma.investorKpiLink
      .update({
        where: { id: link.id },
        data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
      })
      .catch(() => undefined);
  }

  return { ok: true, label: link.label };
}
