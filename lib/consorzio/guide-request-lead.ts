/**
 * Preavviso minimo di una richiesta guida (autoscuola consorziata → consorzio).
 * Configurabile in Impostazioni → Prenotazioni e allievi → Prezzi
 * (`limits.consorzioPricing.guideRequestMinLeadHours`, default 8 ore); vale
 * anche sugli slot che il consorzio propone spostando una richiesta, perché
 * l'autoscuola deve poi confermarli. Vedi docs/features/consorzio.md.
 */

export const DEFAULT_GUIDE_REQUEST_MIN_LEAD_HOURS = 8;

/**
 * `null` se lo slot rispetta il preavviso, altrimenti il messaggio d'errore
 * da mostrare. `minLeadHours` a 0 disattiva la regola.
 */
export function guideRequestLeadTimeError(
  startsAt: Date,
  minLeadHours: number,
  now: Date = new Date(),
): string | null {
  if (!Number.isFinite(minLeadHours) || minLeadHours <= 0) return null;
  const earliest = now.getTime() + minLeadHours * 3600_000;
  if (startsAt.getTime() >= earliest) return null;
  return `Preavviso minimo di ${minLeadHours} ${minLeadHours === 1 ? "ora" : "ore"}: scegli uno slot più avanti.`;
}
