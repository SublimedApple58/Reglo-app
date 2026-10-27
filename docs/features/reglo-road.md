# Reglo Road — Guida in diretta (REG-638)

Modulo che le autoscuole attivano: durante una guida il telefono dell'istruttore entra in **modalità Road** (mappa a tutto schermo, GPS, percorso, segnalazioni degli errori dell'allievo sul punto esatto, Termina guida, riepilogo) e in web app l'autoscuola vede **dal vivo** tutte le auto in guida. Niente dashcam né AI per ora: le segnalazioni le mette l'istruttore a mano.

Piano completo: `plans/road/001-reglo-road.md`.

## Stato

| Fase | Cosa | Stato |
|------|------|-------|
| 1 | Interruttore nel backoffice + flag esposto in settings | ✅ fatta |
| 2 | Backend (sessioni, punti GPS, segnalazioni, live) | da fare |
| 3 | Mobile istruttore (modalità Road) | da fare — richiede build EAS 2.4.0 |
| 4 | Web app (voce Road, Dal vivo, Guide di oggi, storico) | da fare |

## Interruttore del modulo (fase 1)

- **Dove vive**: `CompanyService.limits.roadEnabled` (servizio `AUTOSCUOLE`), tipo in `lib/services.ts` (`ServiceLimits.roadEnabled`). Nessuna migrazione.
- **Nasce spento**: vale solo `=== true`. Assente/false = nessuno vede Road.
- **Chi lo accende**: SOLO il backoffice — card «Reglo Road» nel drawer «Gestisci» di `components/pages/Backoffice/BackofficeCompaniesPage.tsx`, salvata con «Salva modifiche» → `updateCompanyService` (`lib/actions/backoffice.actions.ts`), che invalida la cache Redis `SETTINGS`.
- **Chi lo legge**: `resolveAutoscuolaSettingsData` (`lib/actions/autoscuole-settings.actions.ts`) → campo `roadEnabled` di `AutoscuolaSettingsData` → `GET /api/autoscuole/settings` (web e mobile). È **sola lettura** per il titolare: `updateAutoscuolaSettings` non lo accetta nel patch ma lo conserva (fa `...limits`).
- **Mobile**: l'hook `useRoadEnabled` dovrà leggere `data?.roadEnabled === true` (attenzione: gli altri hook `useXEnabled` usano `!== false`).
