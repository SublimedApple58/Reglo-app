# Prenotazione allievi «solo eccezioni»

Piano: `plans/booking/001-prenotazione-eccezioni.md`. Branch `feat/prenotazione-eccezioni` (non rilasciato).

## Cosa fa
«Chi può prenotare dall'app» (`appBookingActors`) resta la fonte di verità. Quando vale `instructors` gli allievi non prenotano liberamente, ma possono farlo nei **casi di eccezione** che l'autoscuola accende:

| Eccezione | Canale | Flusso |
|---|---|---|
| Slot liberato da un annullamento | `slot_fill` | `broadcastWaitlistOffer` / `respondWaitlistOffer` / `getWaitlistOffers` |
| Posti liberi nelle guide di gruppo | `group_seat` | `broadcastGroupLessonInvite` / `respondGroupLessonInvite` / `getGroupLessonInvites` |
| Ultimo minuto (finestra in ore, 1–168) | `free` limitato | `available-slots`, `date-availability`, `booking-requests`, `createAutoscuolaAppointment` (allievo), job posti vuoti |

Gli **scambi** non sono un'eccezione: li governa solo `swapEnabled` (canale `swap`, fermato solo da blocco e fase).

Tre stati visibili: **Attiva** (`students`/`both`), **Solo eccezioni** (`instructors` + `enabled` + almeno un'eccezione), **Disattiva** (resto).

## Dati (nessuna migrazione: JSON)
- Autoscuola: `CompanyService.limits.studentBookingExceptions` `{enabled, slotFill, groupSeats, lastMinute, lastMinuteHours}` e `studentBookingExceptionsByPath` `{moto?, auto?, pro?}` (eccezioni diverse per percorso).
- Gruppo autonomo: stesse chiavi in `AutoscuolaInstructor.settings` (assenti = eredita).
- Cascata: gruppo per percorso → gruppo → autoscuola per percorso → autoscuola → `LEGACY_INSTRUCTORS_EXCEPTIONS`.
- **Autoscuole che non hanno mai salvato** (tutte quelle su «Solo istruttori» al rilascio): valgono `LEGACY_INSTRUCTORS_EXCEPTIONS` = **«Disattiva»** (decisione di Tiziano, 10/11/2026). Nessuna migrazione dati: conta finché il titolare non salva la riga.

## File
- `lib/autoscuole/student-booking-policy.ts` — modulo puro: parse, cascata, modalità, `hold` (bloccato/AWAITING/TEORIA/percorso mancante), `canStudentUseBookingChannel`, `studentFreeBookingUntil`, messaggi.
- `lib/autoscuole/student-booking-policy-loader.ts` — `loadStudentBookingPolicies`, `filterStudentsByBookingChannel`, `studentBookingPolicyForMember` (puro per riga, usato dal job con il suo Prisma).
- `lib/autoscuole/instructor-clusters.ts` — `studentBookingExceptions` in `InstructorSettings`, `CompanyBookingDefaults`, `EffectiveBookingSettings`.
- `lib/actions/autoscuole-availability.actions.ts` — `ensureStudentCanBookFromApp({channel})` + `bookableUntil`; filtri su offerte, guide di gruppo, «Nuove disponibilità»; `bookingPolicy` in `getBookingOptions`.
- `lib/actions/autoscuole-swap.actions.ts` — destinatari scambi senza bloccati/non in pratica.
- `lib/autoscuole/communications.ts` — job posti vuoti per allievo; push «Posti liberi a breve» con `data.lastMinute`, `lastMinuteHours`.
- `lib/autoscuole/student-phase-notifications.ts` — testi coerenti con la modalità.
- `app/api/autoscuole/notifications/route.ts` — recupero filtrato per allievo e canale.
- `lib/actions/autoscuole-settings.actions.ts`, `app/api/autoscuole/instructor-settings/route.ts`, `lib/actions/autoscuole.actions.ts` (`instructorSettingsSchema`) — salvataggio.
- Test: `tests/unit/autoscuole/student-booking-policy.test.ts`.

## Contratto per il mobile
`GET /api/autoscuole/booking-options` → `bookingPolicy: { mode: "open"|"exceptions"|"closed", hold: null|"blocked"|"awaiting"|"theory"|"license_missing", exceptions: {slotFill, groupSeats, lastMinute, lastMinuteHours}, lastMinuteUntil: ISO|null }`.
Push `available_slots` può portare `lastMinute: true` + `lastMinuteHours`.

## Sicurezza (fix compresi)
- `respondWaitlistOffer` e `respondGroupLessonInvite`: si risponde solo per il proprio profilo (titolare/admin esclusi).
- `getWaitlistOffers`: solo il proprio profilo; il recupero notifiche non restituisce più tutte le offerte attive dell'autoscuola.

## Note
- L'eccezione «ultimo minuto» ignora la chiusura «giorno prima alle HH:MM».
- Gli avvisi push dell'ultimo minuto usano gli orari e l'interruttore di «Guide libere per domani».
- Rilascio: il job posti vuoti è cambiato → `pnpm trigger:deploy:prod`.
