# Piano: Notifiche proattive slot vuoti

## Status: Implementato

## What was done

Implementazione completa del sistema di notifiche push proattive per slot di guida vuoti. Quando domani ci sono posti liberi, gli allievi vengono notificati automaticamente alle 18:00 (ora italiana) per prenotarsi direttamente dall'app.

### Fase 1 — Settings backend
- Aggiunti 2 nuovi campi in `autoscuole-settings.actions.ts`:
  - `emptySlotNotificationEnabled: boolean` (default `false`)
  - `emptySlotNotificationTarget: "all" | "availability_matching"` (default `"availability_matching"`)
- Aggiornati: schema Zod, tipo `AutoscuolaSettingsData`, `resolveAutoscuolaSettingsData`, `updateAutoscuolaSettings`

### Fase 2 — Settings UI web
- Nuova sezione "Notifica slot vuoti" in `AutoscuoleResourcesPage.tsx`
- Toggle + Select condizionale, pattern identico a swapEnabled/swapNotifyMode

### Fase 3 — Cron job backend
- Nuova funzione `processEmptySlotNotifications()` in `lib/autoscuole/communications.ts`
- Nuovo trigger `trigger/autoscuole-empty-slot-notifications.ts` con cron `0 17 * * *` (17:00 UTC = 18:00 CET / 19:00 CEST)
- Logica: per ogni autoscuola attiva con feature abilitata, verifica slot liberi domani, filtra allievi target, esclude chi ha gia' un appuntamento o non ha push token, invia push

### Fase 4 — Mobile
- `notifications.ts`: nuovo kind `available_slots` con tipo `AvailableSlotsData`
- `NotificationOverlay.tsx`: push intent handler, drawer con slot picker + chip durata, handler prenotazione
- `NotificationInboxScreen.tsx`: rendering per il nuovo kind con icona `calendar-outline`

### Fase 5 — Durata nel drawer
- Chip di selezione durata basati su `bookingSlotDurations` dall'endpoint `booking-options`
- Cambio durata ricarica gli slot disponibili

## File modificati

| File | Modifica |
|------|----------|
| `lib/actions/autoscuole-settings.actions.ts` | 2 nuovi settings |
| `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx` | UI toggle + select |
| `lib/autoscuole/communications.ts` | `processEmptySlotNotifications()` + helpers |
| `trigger/autoscuole-empty-slot-notifications.ts` | **Nuovo** — cron task daily |
| `reglo-mobile/src/types/notifications.ts` | Nuovo kind `available_slots` |
| `reglo-mobile/src/components/NotificationOverlay.tsx` | Push intent + drawer + slot picker |
| `reglo-mobile/src/screens/NotificationInboxScreen.tsx` | Rendering nuovo kind |

## Note deployment
- Trigger.dev: il nuovo task va deploiato con `pnpm trigger:deploy:dev` / `pnpm trigger:deploy:prod`
- Nessuna migrazione DB necessaria (valori nel JSON `CompanyService.limits`)
- Mobile: basta un EAS Update (`eas update --branch production`), nessun build nativo necessario
