# Never-accessed nudge (allievo mai loggato)

## Cosa fa
Segnala al titolare (web) gli **allievi con account creato da lui ma mai usato** — cioè che non hanno **mai fatto accesso in app** → non ricevono i promemoria delle guide. Due punti:
- **Agenda**: sui blocchi guida individuali di quell'allievo compare un **megafono 3D** nell'angolo, che squilla come una campanella (una volta all'apertura + all'hover). Hover → popover; click sul megafono → lo "fissa". Il popover mostra un CTA **WhatsApp** (messaggio precompilato con nome + data/ora guida) se l'allievo ha un numero; altrimenti spiega che non lo si può avvisare da qui.
- **Lista allievi**: un **cellulare-divieto 3D** accanto al nome, con tooltip esplicativo all'hover.

## Come si calcola "mai loggato"
`neverAccessed = l'utente NON ha alcun `MobileAccessToken` (emesso a ogni login/signup/accettazione-invito mobile) E NON ha alcun `MobilePushDevice` (creato al primo avvio app con registrazione push)`. La presenza di una delle due righe prova che l'app è stata usata almeno una volta; l'assenza di entrambe è il miglior segnale "mai acceduto" disponibile (non esiste un campo `lastLoginAt`). Falsi positivi solo in casi limite (logout ovunque + push negati, oppure reset password che cancella i token).

## File coinvolti
- **Backend** — `lib/actions/autoscuole.actions.ts`:
  - `buildNeverAccessedUserIds(userIds)` — helper batch: query `mobileAccessToken` + `mobilePushDevice` (`distinct userId`), ritorna il `Set` degli userId mai-acceduti. Pattern gemello di `buildAppointmentGridFlags`.
  - `toStudentProfile(user, createdAt, neverAccessedSet?)` — choke point liste: aggiunge `neverAccessed` quando il set è passato. `phone` già presente.
  - `listDirectoryStudents` — calcola il set e lo passa → alimenta l'array `students` del **bootstrap agenda** (usato per le mappe client).
  - `getAutoscuolaStudentsWithProgress` — calcola il set → alimenta la **lista allievi web**.
- **Web** — `components/pages/Autoscuole/NeverAccessedNudge.tsx` (nuovo): `NeverAccessedNudge` (badge megafono + popover hover/pin + WhatsApp) e `NeverAccessedListMark` (cellulare-divieto + tooltip). Normalizzazione numero IT per `wa.me`.
  - `AutoscuoleAgendaPage.tsx`: tipi `StudentOption` + `AgendaBootstrapPayload.students` estesi con `phone?`/`neverAccessed?`; mappe client `neverAccessedById` (Set) e `phoneById` (Map) da `students` (come `studentLicenseById`); `neverAccessedFor(item)` (solo guide individuali, non gruppo); overlay del badge nei due render blocco (colonna-istruttore settimana + vista giorno).
  - `AutoscuoleStudentsPage.tsx`: tipo `Student` + `neverAccessed?`; `NeverAccessedListMark` in `renderNameCell` (copre tutte le liste).
- **Animazione** — `assets/styles/globals.css`: `@keyframes megaphone-bell` + `.megaphone-ring` (squillo one-shot) con guardia `@media (prefers-reduced-motion: reduce)` → chi ha "Riduci movimento" attivo vede l'icona **ferma** (comunque presente/cliccabile).
- **Asset** — `public/images/3d/megafono-3d.png` (📢 Fluent 3D) e `no-phone-3d.png` (📵 Fluent 3D), Microsoft Fluent Emoji (MIT), 256×256.

## Modifica/aggiunta telefono allievo (2026-07-16)
Il titolare può **aggiungere/modificare/cancellare** il numero dell'allievo dal pannello dettaglio (tab Riepilogo → Anagrafica → Telefono, link "Aggiungi"/"Modifica", inline-edit). Serve proprio per popolare il numero degli allievi senza app, così il nudge WhatsApp diventa azionabile.
- **Backend**: `updateStudentPhone({ studentId, phone })` in `autoscuole.actions.ts` — gate `canManageStudentCredits`; verifica che lo studentId sia uno `STUDENT` della company (il telefono è su `User`, globale) e poi `user.update({ phone })`. Stringa vuota = `null` (cancella); validazione formato `^[+()\-\s\d]{5,25}$`.
- **Web**: inline-edit nel `AutoscuoleStudentsPage` (Anagrafica) → aggiorna `register` locale col valore confermato dal BE + `load()` per rinfrescare lista/indicatore. Nessun optimistic update.

## Note
- **Solo guide individuali**: le guide di gruppo hanno più allievi → nessun singolo destinatario, niente badge.
- **Cache**: il flag entra nel payload bootstrap agenda già in cache Redis (20s) → quando un allievo accede, il badge sparisce entro ~20s.
- **Perf**: 2 query indicizzate extra per bootstrap / lista (userId `in`), cheap.

## Connessioni
- **Mobile Auth / Push** — dipende da `MobileAccessToken` (login mobile, `lib/mobile-auth.ts`) e `MobilePushDevice` (registrazione push). Vedi domanda tecnica di partenza: nessun `lastLoginAt` su `User`.
- **Appointments / Agenda** — legge la directory `students` del bootstrap (`getAutoscuolaAgendaBootstrapAction`).
- **Students directory** — `getAutoscuolaStudentsWithProgress` (`AutoscuoleStudentsPage`).
