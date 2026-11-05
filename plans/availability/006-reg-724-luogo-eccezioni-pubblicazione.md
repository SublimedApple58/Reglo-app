# REG-724 — Luogo delle fasce nelle eccezioni e nella pubblicazione (hotfix)

> **Fatto (05/11/2026)**: selettore del luogo nel Calendario (eccezioni del
> giorno e ricorrenti) e nell'editor «A pubblicazione» del web; corretto il
> caricamento concorrente delle settimane nell'editor di pubblicazione.
> Backend e motore già leggevano e salvavano il luogo: nessuna modifica server,
> nessuna migrazione, nessun job Trigger. Mobile: stesso buco, follow-up.

## Richiesta
Con «Disponibilità per luogo» accesa (REG-705) il luogo si impostava solo nella
settimana tipo e dal cambio rapido in agenda (REG-717). Mancava nelle eccezioni
della modalità predefinita e nelle settimane pubblicate. Hotfix urgente con via
di Tiziano a rilasciare su prod e staging; branch da `origin/main`.

## Fasi
1. **Verifica backend/motore** — override del giorno, ricorrente, settimanale e
   pubblicazione passano da `sanitizeRangeLocations`/`applyRangeLocations` con il
   controllo ruoli REG-717; `publishInstructorWeek` copia le fasce intere; il
   resolver (`parseRanges`) tiene `locationId` → nessuna modifica.
2. **Web** — `CalendarOverrides` usa `LocatedRangeList` a funzione effettiva;
   `InstructorPublicationEditor` riceve `locations` e mostra `RangeLocationSelect`
   per fascia + luogo nella riga chiusa; `loadSeq` contro le risposte vecchie.
3. **Test** — unit (salvataggio + motore sugli override), e2e Calendario +
   Pubblicazione su dev.
4. **Rilascio** — main (ff), staging (merge), e2e su staging.

## Fuori
- Mobile istruttore (eccezioni, pubblicazione): segnalato, non toccato.
