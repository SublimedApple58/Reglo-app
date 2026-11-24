# Impostazioni dell'account (overlay)

L'overlay a tutto schermo che si apre con `?tab=settings` (menu account →
«Impostazioni»). Codice: `components/pages/Autoscuole/AutoscuoleResourcesPage.tsx`;
le sezioni stanno in `tabs/*`, `VoiceSettingsPane.tsx`, `AspettoSettingsPane.tsx`,
`EvaluationSheetPane.tsx`, `RoadSettingsPane.tsx`, `locked/*` (consorziata senza Reglo).

## Sezioni

Sidebar a sinistra da `lg` in su; sotto `lg` le stesse voci sono una tab bar
(`UnderlineTabs`, design-system §4b-bis). Le sezioni restano montate quando
sono nascoste (`KeepAlivePane`): il cambio sezione è istantaneo.

## Posizione nell'URL (REG-778, 2026-11-24)

`/user/autoscuole?tab=settings&pane=<sezione>&sub=<sotto-scheda>`

- Senza `pane` si apre su **Informazioni aziendali** (`business`); solo
  Segretaria apre `voice`, la consorziata senza Reglo sempre `business`.
  `pane=students` e `pane=payments` (link vecchi) portano a `bookings`.
- Cambio sezione = **push** (l'indietro del browser torna alla sezione di
  prima); cambio sotto-scheda = **replace** (al refresh si resta lì, l'indietro
  non ripercorre ogni scheda).
- Si scrive con `window.history` (`settings/settings-url.ts` →
  `writeSettingsUrl`): Next aggiorna `useSearchParams` senza giro sul server.
- Sotto-schede nell'URL con `useSettingsSubTab(keys, fallback)`: legge e scrive
  `sub` solo la sezione a schermo (`SettingsPaneActiveContext`, fornito da
  `KeepAlivePane`). Oggi: Prenotazioni e allievi (`generali`, `limiti`,
  `guide`, `app`, `crediti`/`prezzi`), Promemoria (`allievi`, `istruttori`,
  `mano`, `log`), Segretaria (`linea`, `comportamento`, `orari`, `istruzioni`).
  La scheda di default non compare nell'URL.
- Il dettaglio di un istruttore o di un veicolo (e le sue schede) non è
  nell'URL.

## Link in ingresso

`NovitaDialog`, `InviteCodeDialog`, `StudentWhatsAppButton` (`pane=reminders`
+ ancora del benvenuto → scheda «Manuale»), `AutoscuoleVoicePage`
(`pane=voice`), `AutoscuoleRoadPage` (`pane=road`), redirect di
`/user/settings` (`pane=business`) e `/user/autoscuole/settings`.
