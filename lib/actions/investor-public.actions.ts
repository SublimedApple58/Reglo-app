"use server";

import {
  asInvestorPeriod,
  buildInvestorKpis,
  resolveInvestorLink,
} from "@/lib/investor/investor-kpi";

/**
 * Ricalcolo dei KPI investor per il cambio periodo, senza ricaricare la pagina.
 *
 * È un'action PUBBLICA di proposito: l'autorizzazione è il token, esattamente
 * come per la pagina che la ospita — chi ce l'ha vede già questi numeri. Non
 * incrementa il contatore delle visite: cambiare filtro non è una visita nuova.
 * In caso di token sconosciuto/revocato/scaduto non torna nulla.
 */
export async function fetchInvestorKpis(token: string, period: string) {
  const link = await resolveInvestorLink(token, { countView: false });
  if (!link.ok) return { success: false as const };
  const kpis = await buildInvestorKpis(asInvestorPeriod(period));
  if (!kpis) return { success: false as const };
  return { success: true as const, data: kpis };
}
