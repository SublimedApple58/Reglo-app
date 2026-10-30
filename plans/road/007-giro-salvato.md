# Road 007 — Giro modificato salvato sul server (REG-668)

**COMPLETATO 30/10/2026.** Web `d771343` (staging → main, migrazione `20261105120000_road_lesson_plan` su staging e prod); mobile master `0343b24`, OTA 2.4.0 iOS `01a18da7-91db-7ece-9341-79cc8cbbeee0` / Android `01a18da8-4a7d-7212-8a0b-c0cbee74722c`.

## Cosa è stato fatto
- Tabella `RoadLessonPlan` (una riga per guida, chiave `appointmentId`): tappe nell'ordine dell'istruttore, minuti, chi e quando. Migrazione solo additiva.
- `GET/PUT/DELETE /api/autoscuole/road/plan/saved?appointmentId` (`lib/autoscuole/road/saved-plan-service.ts`): istruttore della guida o titolare/admin; scrittura solo su guide in programma e non ancora partite.
- `startRoadSession`: con il giro acceso usa quello salvato e lo segna `plan.custom` (la mobile non riottimizza).
- Mobile: giro salvato per guida in `planStore` (letto con il giro proposto, mai al tocco); foglio «Il giro» con Salva vero (spinner, errore nel foglio), «Giro modificato · salvato alle …» e «Torna al giro suggerito».
- Fix: segnaposto di `RoadPlanMap` con chiave per posizione (il «1» reinserito in mezzo non si disegnava su iOS New Architecture).

## Piano (mini-piano approvato in chat)
1. Dove: tabella dedicata `RoadLessonPlan` (non un campo sull'appuntamento).
2. API: GET/PUT/DELETE `/road/plan/saved`; alla partenza in Road vince il salvato.
3. Chi: istruttore della guida o titolare; solo guide non annullate e non iniziate.
4. Giro di base che cambia: il salvato è una fotografia, resta finché non si torna al suggerito.
5. UI: Salva esplicito con spinner, errore gestito, riapertura col giro salvato.

## Verifica
- Staging: endpoint deployato (risponde `USER_NOT_AUTHENTICATED` senza login), migrazione applicata.
- Prod, simulatore contro app.reglo.it (demo «Autoscuola Reglo», guida futura di Alice Di Battista, con forzatura locale per mostrare la riga — tolta prima del commit): salva → riga in `RoadLessonPlan`; app chiusa e riaperta → giro salvato; «Torna al giro suggerito» → riga cancellata (dati prod lasciati come prima: 0 righe).
- Non provati: errore di rete reale nel foglio, Android.
