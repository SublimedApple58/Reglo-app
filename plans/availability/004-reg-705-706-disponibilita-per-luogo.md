# Piano — REG-705 Disponibilità per luogo + REG-706 Codici di invito per luogo

> **Stato (2026-11-03)**: piano APPROVATO da Tiziano con le decisioni sotto.
> Fatti (commit locali, niente push): **705-a**, **705-b** (UI approvata), **705-c**
> (UI approvata), **705-d** (motore). Restano 705-e e REG-706. 03/11: screenshot reali mobile fatti su simulatore dedicato (Metro 8705); trovato e corretto un buco di 705-c sul mobile (mobile a307102: «Disponibilità di X» del titolare senza luogo, `select-options` mancante negli stack role/ e more/). 705-e: anteprime pronte (/tmp/hiro-anteprime/reg-705/705e-anteprima-*), in attesa dell'ok.
> In origine: **705-a** (backend: tabella luoghi allievo + backfill, interruttore e
> pausa nei setting, API di assegnazione) — branch `feat/reg-705-luoghi-disponibilita`,
> worktree `reglo-worktrees/reg-705`. Nessun rilascio: si arriva al massimo a
> staging, mai produzione senza il via esplicito di Tiziano.

## Cosa è stato fatto finora (705-a)

- Tabella `CompanyMemberLocation` (allievo ↔ luoghi, N:N), migrazione additiva
  `20261108120000_company_member_locations` con backfill dal luogo di default
  (REG-392). Applicata sul DB dev a mano (`db execute` + `migrate resolve`, mai reset).
- `lib/autoscuole/location-availability.ts` (puro, testato): interruttore,
  pausa tra luoghi, ambito luoghi dell'allievo, regola «la fascia vale per
  l'allievo», normalizzazione luoghi + luogo principale.
- `lib/autoscuole/member-locations.ts`: unico punto di lettura/scrittura dei
  luoghi dell'allievo; tiene l'invariante «se l'allievo ha dei luoghi, il
  principale è uno di questi»; pulizia all'archiviazione di un luogo.
- Setting in `limits` (via `updateAutoscuolaSettings` / `getAutoscuolaSettings`):
  `availabilityByLocation`, `locationChangeBufferEnabled`, `locationChangeBufferMinutes`.
- Action `setStudentLocations` + route mobile `PUT /api/autoscuole/students/[id]/locations`;
  `setStudentDefaultLocation` passa dall'invariante; `locationIds` esposto nelle
  liste allievi (bootstrap agenda, `getAutoscuolaStudents`, `getAutoscuolaStudentsWithProgress`).

---

## Decisioni di Tiziano (2026-11-03)

1. **Piano approvato.** La disponibilità per luogo degli istruttori si configura
   nel **tab Disponibilità degli istruttori della web app** (Gestisci →
   Istruttori → Disponibilità) **e dall'app istruttore**; l'**interruttore**
   sta in **Impostazioni → Sede e luoghi**. → Coincide con il piano iniziale,
   nessun riallineamento.
2. **Allievo senza luoghi** con interruttore acceso: **vede tutti i luoghi**.
3. **Fascia senza luogo**: **vale per tutti i luoghi**.
4. **App vecchie**: il mobile va in **OTA sul runtime 2.4.0**; si caricherà la
   build nativa nuova sugli store e poi il blocco «Aggiorna l'app» sulla 2.3.0
   (force-update floor). **Nessuna guardia speciale lato server** per i client
   vecchi oltre a quella. **Non andare in conflitto con Reglo Road**, che mette
   codice e OTA sul 2.4.0.
5. **Prenotazione**: nome del luogo sugli slot + mappa di TUTTI i punti web e
   mobile dove il luogo va mostrato o gestito (sotto).
6. **Pausa minima tra guide consecutive in luoghi diversi: SÌ nella v1**,
   impostabile da Impostazioni → Sede e luoghi (vicino all'interruttore), con
   effetto sul motore slot.
7. **Codici per luogo** (REG-706): **solo con l'interruttore acceso**.
8. **«Stile UI primary»** = la priorità è una UI bellissima: scelta libera della
   soluzione più bella.
9. **Allievi già iscritti che si aggiungono un luogo col codice**: fuori dalla
   v1, se ne occupa solo lo staff.

## Base dei repo

- **Web**: `feat/reg-705-luoghi-disponibilita` da `origin/staging` (`e64f9da`).
- **Mobile** (verificato 2026-11-03): `app.json` → `version` e `runtimeVersion`
  **2.4.0**. Il lavoro Road 2.4.0 vive su **`master`** (`origin/master` =
  `91e43b6`, Top 10 Road in prod 31/10); nessun branch Road aperto davanti a
  master. Il worktree mobile `reglo-mobile-worktrees/reg-705` partirà da
  `origin/master` aggiornato **al momento di 705-b** (non serve per 705-a), e
  prima di ogni ship si rimergia `origin/master` per assorbire i commit Road.
  OTA solo runtime 2.4.0, `--branch production`, iOS poi Android, mai senza ok.

---

## REG-705 — Disponibilità istruttore per luogo, allievi su più luoghi

### (1) Fisso o configurabile
Configurabile, spento di default: `limits.availabilityByLocation` (nessuna
migrazione per il flag). Effettivo solo con **≥ 2 luoghi attivi**
(`availabilityByLocationEnabled`). Spento = comportamento identico a oggi; i
luoghi di fasce e allievi restano in database. Consorzi esclusi nella v1.

### (2) Dove stanno i setting
- **Interruttore + pausa tra luoghi**: web, Impostazioni → «Sede e luoghi», in
  fondo, accanto a «Luoghi diversi per tipo di patente».
  Pausa: `locationChangeBufferEnabled` + `locationChangeBufferMinutes`
  (5–120, passi di 5, default 30).
- **Luoghi dell'allievo**: web scheda allievo (drawer Allievi), «Luogo di
  default» → «Luoghi» a scelta multipla (il principale resta); mobile dettaglio
  allievo, form sheet nativo a scelta multipla; poi azione di gruppo nella barra
  flottante di Allievi.
- **Luogo delle fasce**: selettore «Luogo» su ogni fascia — web tab
  Disponibilità istruttore (Predefinito, Calendario, Pubblicazione) e app
  istruttore (settimana tipo, eccezioni, pubblicazione). Solo a interruttore acceso.

### (3) Account
- Titolare / titolare-istruttore (web): interruttore, pausa, luoghi allievi, disponibilità istruttori.
- Istruttore (mobile): luogo delle sue fasce, luoghi degli allievi.
- Allievo (mobile): vede solo gli slot dei suoi luoghi, ognuno con il nome del luogo.

### (4) Piattaforme
Full-stack: backend + web + mobile.

### (5) Cosa si riusa
`AutoscuolaLocation` + API luoghi; `CompanyMember.defaultLocationId` (REG-392)
come luogo principale; `resolveStudentBookingLocationId` quando la fascia non ha
luogo; pattern dell'interruttore di REG-409 (`listLocationsForCompany`);
motore slot (`slot-packing`, `slot-assignment`, `getPublicationModeFilter`).

### Schema dati
- `CompanyMemberLocation(companyId, userId, locationId, createdAt)`, PK
  composta, FK composta su `CompanyMember` e su `AutoscuolaLocation` (cascade).
- Fasce: `locationId?` opzionale dentro i JSON `ranges` / `rangesByDay`
  (`AutoscuolaWeeklyAvailability`) e `ranges` (`AutoscuolaDailyAvailabilityOverride`).
  Assente = tutti i luoghi. Vincolo unico invariato; i lettori attuali ignorano il campo.

### Migrazioni
Una additiva (`CompanyMemberLocation`) + backfill dal luogo di default (in prod
342 allievi in 2 autoscuole). Nessuna migrazione per i JSON.

### Effetto sulla prenotazione (705-d)
- Slot e calendario allievo (`getAllAvailableSlots`, `getDateAvailabilityMap`):
  fascia valida se senza luogo o con un luogo dell'allievo; una guida non sta a
  cavallo di due fasce con luoghi diversi.
- **Luogo della guida** = luogo della fascia; senza, precedenza attuale
  (default allievo → patente → sede).
- **Pausa tra luoghi**: uno start è scartato se l'istruttore ha una guida
  adiacente in un luogo diverso a meno di N minuti (prima o dopo). Vale per le
  proposte all'allievo e per la conferma; non blocca lo staff (solo avviso).
- Allineati: `createBookingRequest`, `findBestAutoscuolaSlot`,
  `suggestInstructorBooking`, waitlist (`slot-assignment`: notifica solo agli
  allievi di quel luogo), scambi (chi accetta deve avere il luogo della guida).
- Prenotazioni manuali dello staff: nessun blocco; Luogo precompilato dal luogo della fascia.

### Allievi esistenti
Interruttore spento: nulla cambia. Acceso: chi ha un luogo di default parte con
quello; gli altri vedono tutti i luoghi finché lo staff non li assegna.

### Mappa dei punti dove il luogo va mostrato o gestito
**Web (`reglo`)**
| Punto | File | Cosa |
|---|---|---|
| Impostazioni → Sede e luoghi | `locations/LocationsSection.tsx` | interruttore + pausa tra luoghi (705-a backend, UI in 705-b/c) |
| Disponibilità istruttore — Predefinito/Calendario/Pubblicazione | `tabs/InstructorsTab.tsx`, `InstructorPublicationEditor` | selettore Luogo per fascia (705-c) |
| Lista Allievi + filtro Luogo | `AutoscuoleStudentsPage.tsx`, `filters/ToolbarFilters.tsx` | colonna Luogo → luoghi dell'allievo; filtro per luogo assegnato (705-b) |
| Scheda allievo (drawer) | `AutoscuoleStudentsPage.tsx` | «Luoghi» multipli + principale (705-b) |
| Barra flottante Allievi | `AutoscuoleStudentsPage.tsx` | assegna luoghi in gruppo (705-b) |
| Agenda — crea guida | `AutoscuoleAgendaPage.tsx` (`CreateEventPopover`) | precompila Luogo dal luogo della fascia (705-d) |
| Agenda — fasce di disponibilità | `AutoscuoleAgendaPage.tsx` | nome del luogo sulla fascia disponibile (705-c) |
| Modifica guida | `EditAppointmentDialog.tsx` | invariato (già ha Luogo) |
| Guide di gruppo | `dialogs/GroupLessonCreateDialog.tsx` | invariato nella v1 (luogo già a livello di gruppo) |
| Pagamenti | `AutoscuolePaymentsPage.tsx` | invariato (mostra già il luogo) |
| Chiave di accesso | `dialogs/InviteCodeDialog.tsx` | codici per luogo (REG-706) |

**Mobile (`reglo-mobile`)**
| Punto | File | Cosa |
|---|---|---|
| Allievo — prenotazione (slot, giorni, conferma) | `AllievoHomeScreen.tsx`, `useAvailableSlots`, `useDateAvailability`, `useBookSlot` | nome del luogo su ogni slot e in conferma (705-e) |
| Allievo — dettaglio guida / home card | `app/(tabs)/home/lesson-detail.tsx`, `AllievoHomeScreen.tsx` | invariato (già mostra il luogo) |
| Istruttore — Disponibilità | `DefaultAvailabilityEditor.tsx`, `PublicationModeEditor.tsx`, `role/availability-exception.tsx`, `role/publish-day`, `RangesEditor.tsx` | Luogo per fascia (705-c) |
| Istruttore/titolare — dettaglio allievo | `StudentNotesDetailScreen.tsx`, `StudentSettingsSheet.tsx` | «Luoghi» multipli (705-b) |
| Istruttore — nuova guida / prenotazione rapida | `BookingForm.tsx`, `bookingSheetStore.ts`, `IstruttoreHomeScreen.tsx`, `LocationPickerSheet.tsx`, `InlineLocationPicker.tsx` | precompila Luogo dal luogo della fascia (705-d/e) |
| Gestisci guida | `app/(tabs)/home/manage-lesson.tsx`, `manageLessonStore.ts` | invariato |
| Luoghi guida | `LocationsScreen.tsx`, `more/location-form.tsx` | invariato |
| Road | `road-invite.tsx`, `src/road/entryFlow.ts` | invariato (legge il luogo della guida) |
| Tipi/API | `src/types/regloApi.ts`, `src/services/regloApi.ts` | `locationIds` allievo, `locationId` fasce, `setStudentLocations` |

### Stima e spacchettamento (rivista con la pausa)
Totale **18–20 punti** → spacchettato:

| # | Sotto-task | Piattaforme | Punti |
|---|---|---|---|
| 705-a | Tabella + backfill, interruttore e pausa nei setting, API assegnazione luoghi | backend | 3 |
| 705-b | Luoghi dell'allievo: drawer web + filtro + azione di gruppo + dettaglio allievo mobile; UI interruttore e pausa in Sede e luoghi | web + mobile | 3 |
| 705-c | Luogo sulle fasce: editor web (3 viste) + editor mobile; nome luogo sulle fasce in agenda | web + mobile | 5 |
| 705-d | Motore: filtro slot per luogo, luogo della guida, **pausa tra luoghi**, waitlist, scambi, precompile staff, test | backend | 5 |
| 705-e | Prenotazione allievo: nome del luogo sugli slot e in conferma | mobile | 2 |

---

## REG-706 — Codici di invito per ogni luogo nel modale della chiave

1. **Configurabile**: sezione visibile solo con l'interruttore di REG-705 acceso
   (≥ 2 luoghi).
2. **Dove**: web, Allievi → «Chiave di accesso» (`dialogs/InviteCodeDialog.tsx`).
   Codice autoscuola in alto; sotto «Codici per luogo»: una riga per luogo,
   codice mascherato, «Mostra» con dissolvenza 200 ms, poi «Copia». Niente
   pillole o badge; scelta libera della soluzione più bella (decisione 8),
   anteprime prima del rilascio.
3. **Account**: chi ha accesso ad Allievi sul web; l'allievo usa il codice in
   registrazione da app (campo invariato).
4. **Piattaforme**: backend + web; mobile invariato (controllo messaggi d'errore).
5. **Riuso**: `lib/autoscuole/invite-codes.ts` (6 caratteri, generazione pigra
   race-safe), unicità tra tabelle (autoscuola, istruttore, luogo), lookup in
   `student-register` esteso con il luogo.

- **Schema**: `AutoscuolaLocation.inviteCode String? @unique`, migrazione additiva, nessun backfill.
- **Registrazione**: codice di luogo → entra nell'autoscuola + riceve quel luogo
  (`CompanyMemberLocation` + principale) via `member-locations.ts`.
- **Fuori v1**: allievi già iscritti che si aggiungono un luogo col codice.
- **Stima**: 3 punti. Dipende da 705-a. Branch/worktree propri.

---

## Regole di implementazione
- Un task = un branch = un worktree; mai nelle copie principali.
- Migrazioni sul DB dev una alla volta, MAI `prisma migrate reset`.
- Dev server su porta propria se ne gira già un altro.
- UI: anteprime prima del rilascio; design premium, niente pillole/tag/badge/
  eyebrow decorativi; animazioni 200–300 ms senza overshoot; skeleton; niente
  `useReducedMotion` / `MotionConfig reducedMotion="user"` / media query che
  spengono le animazioni; niente blu o navy. Mobile: `docs/design-system.md`.
- E2E Playwright sulle parti di UI, screenshot ritagliati in
  `/tmp/hiro-anteprime/reg-705/` con riga `HIRO_SHOT: <percorso>`.
- Al massimo staging (dopo `git merge origin/staging`); mai prod senza via di Tiziano.
- Spazio su disco: fermarsi sotto i 5 GB liberi.

## Note sui doc
- `docs/features/locations.md` si contraddice sul `BookingForm` mobile
  (`locationForLicense.ts` non esiste): da correggere.
- `reglo-mobile/docs/features/locations.md` vecchio (navy, rosa, Fluent).
- `impact-map`: aggiungere registrazione con codice ↔ luoghi (REG-706).
