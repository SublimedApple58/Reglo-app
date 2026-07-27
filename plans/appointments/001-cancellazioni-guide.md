# Piano: Gestione cancellazioni guide (3 temi)

> Stato: **APPROVATO 2026-07-20**, in implementazione su branch `feature/cancellazioni-guide` (web + mobile).
> Nessuna migrazione DB in nessuna fase.

## Cosa è stato fatto (aggiornare a fine lavoro)
- _(da compilare)_

---

## Contesto / decisioni prese

Tre temi nel dominio cancellazioni, convergono sullo stesso componente web `AutoscuoleStudentsPage.tsx` (tab "Guide").

Distinzione chiave dei confini:
- **Tema 1** = il **titolare purga** una guida → sparisce da storico + agenda (nuovo `cancellationKind: "record_cleanup"`).
- **Temi 2 e 3** = **annullamenti dell'allievo** (`cancellationKind: "manual_cancel"`) → restano visibili (mobile allievo + preavviso web).

Decisioni utente:
1. Tema 1 semantica → cancella "hard": **nessun rimborso**, fuori da storico + agenda, slot liberato. NON è l'"Annulla" né il "Cancella operativo" esistenti (entrambi lasciano in storico; l'operativo rimborsa in pieno).
2. Tema 1 esami/gruppi → **esclusi** dal cancella-per-riga (v1).
3. Tema 3 preavviso → su **tutte** le annullate manuali + badge **"Tardiva"**.
4. "Cancella / Cancella tutte" → **solo guide future/non concluse** (v1). NON tocca le passate/completate (non riscrive le ore storiche).

Perché soft-delete e non hard-delete: l'appointment ha FK/relazioni (vehicle link, slot, crediti, notifiche, audit) → hard-delete rischioso. Soft-delete + esclusione mirata via `cancellationKind` ottiene tutto senza rischi referenziali.

---

## Fase 1 — Backend (`reglo/`)

**1a.** Nuova action `hardCleanupAutoscuolaAppointment(appointmentId)`:
- Guard **owner/admin**.
- Soft-delete, `status: "cancelled"`, **nuovo** `cancellationKind: "record_cleanup"`.
- Nessun rimborso credito, nessuna penale.
- Libera lo slot (esporre `releaseSlotsForAppointment` da `operational-cancellation.ts`).
- Niente notifica allievo.
- Solo guide **future/non concluse**.
- Batch `hardCleanupAutoscuolaAppointmentsByStudent` per "Cancella tutte".
- Escludere da storico: `cancellationKind != "record_cleanup"` nel where di `getAutoscuolaStudentDrivingRegister`.

**1b.** Estendere proiezione `light` di `getAutoscuolaAppointmentsFiltered` con `cancelledAt, penaltyAmount, penaltyCutoffAt, lateCancellationAction` + query/param storico annullate (finestra `from` ampia).

**1c.** Aggiungere `penaltyCutoffAt` al payload di `getAutoscuolaStudentDrivingRegister` (badge "Tardiva").

## Fase 2 — Web dettaglio allievo (Temi 1+3, `AutoscuoleStudentsPage.tsx`)

**2a.** Bottone "Cancella" per-riga (solo guide normali future/non concluse) + "Cancella tutte" header → batch. Conferma AlertDialog. Refresh via `loadRegister` (no optimistic).
**2b.** Preavviso "Xh Ymin" su annullate manuali (`startsAt − cancelledAt`) + badge "Tardiva" (`cancelledAt > penaltyCutoffAt`).

## Fase 3 — Mobile guide annullate (Tema 2, `reglo-mobile/`)

**3a.** Aggiornare tipo `AutoscuolaAppointment` mobile (`cancelledAt, penaltyAmount, penaltyCutoffAt, lateCancellationAction`) + funzione API storico.
**3b.** Nuova vista "Guide annullate" (preview Airbnb mono-navy prima, poi implementazione). Filtra `cancellationKind === "manual_cancel"`. Badge "Annullamento tardivo" e "Addebitata (€X)" solo se `lateCancellationAction === "charged"`. Segmento in "Le tue guide", non in home.

## Fase 4 — Docs + rilascio

Aggiornare `appointments.md`/`penalties.md` (web) + feature doc mobile + INDEX/impact-map di entrambi. Rilascio web (main) + mobile (OTA 2.1.0) al via libera.
