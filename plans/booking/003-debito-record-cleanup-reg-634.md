# REG-634 — Blocco per debito: guide rimosse dallo storico e conteggi divergenti

## Cosa è stato fatto (26/10/2026)

- Regola unica "guida da pagare" in `lib/autoscuole/lesson-unpaid.ts` (modulo puro):
  esclude `cancellationKind="record_cleanup"`; `cancellationKind` è obbligatorio
  nel tipo d'ingresso, così chi conta deve selezionarlo.
- Un solo conteggio server (`getStudentsUnpaidLessonCounts`): prenotazione da app,
  `getBookingOptions`, lista Allievi, sblocco singolo/bulk. Legge solo le guide
  candidate (pre-filtro Prisma testato contro il predicato), senza `take`.
- Lista Allievi: il debito non viene più contato sulle guide troncate a 5000.
- Drawer web, ex allievi e gemello mobile (`reglo-mobile/src/utils/lessonPayments.ts`)
  usano la stessa regola.
- Verificato su staging (company Reglo E2E): codice vecchio → bloccata, codice
  nuovo → sbloccata e stabile; lista "2 guide da pagare", scheda "Da pagare: 2";
  controprova senza marcatore → blocco. Dati di test rimossi.

## Origine

Segnalazione di Robatto (Cabras Valentina): l'allieva risultava sbloccata nella
scheda ma ri-bloccata a ogni tentativo di prenotazione. La scheda escludeva le
guide `record_cleanup`, il controllo di prenotazione no: 4 contro 5, soglia 5.

## Piano (come concordato)

### Fase 1 – Regola unica
Predicato condiviso + filtro `record_cleanup` in tutti i conteggi, web e mobile.

### Fase 2 – `removeAppointmentFromRecord`
Valutato e lasciato com'è: la penale resta sul record (reversibile, nessuna
perdita di dato) ma non conta più da nessuna parte grazie alla Fase 1.

### Fase 3 – Tetto di 5000 guide nella lista Allievi
Risolto per il debito (query dedicata senza tetto). **Resta aperto** per il
riepilogo guide/obbligo della lista, che usa ancora lo stesso fetch troncato:
da aprire a parte.

### Fase 4 – Rilascio
Staging fatto. Produzione e OTA mobile in attesa del via di Tiziano.
