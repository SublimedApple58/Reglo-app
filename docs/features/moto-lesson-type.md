# Tipo guida moto (birilli / strada)

Attributo **strutturato e opzionale** di una guida moto individuale che
distingue le sessioni **birilli** (prova in area chiusa, slalom tra i coni) da
quelle su **strada**. Non è una nota libera: è un campo dedicato, riconoscibile,
mostrato con un badge sul blocco agenda. Richiesta: nota "Novità per Reglo",
punto 12 (REG-399).

## Scope
- **Guide moto INDIVIDUALI** (`AutoscuolaAppointment.motoLessonType`) — v1, REG-399.
- **Guide di GRUPPO moto** (`AutoscuolaGroupLesson.motoLessonType`, `kind="moto"`) —
  REG-406. Il tipo vive sul **container** (proprietà condivisa da tutta la guida,
  come `kind`/`capacity`), non per-partecipante: tutti gli iscritti fanno lo
  stesso tipo. Stessa UX/terminologia del selettore individuale.
- **Opzionale**: una guida moto può non avere il tipo (`null`). Nessun obbligo di
  scelta.
- Significativo **solo per le guide moto** (individuali e gruppi `kind="moto"`) —
  le altre guide lo ignorano (la UI non lo offre; il BE lo accetta ma non lo
  espone altrove). I gruppi standard non lo usano mai.

## Data model
- `AutoscuolaAppointment.motoLessonType String?` — `"birilli" | "strada"`, `null`
  = non-moto o non impostato. Additivo, nessun backfill.
  Migrazione: `20260824164017_add_moto_lesson_type`.
- `AutoscuolaGroupLesson.motoLessonType String?` (REG-406) — stessa semantica sul
  container della guida di gruppo moto (`kind="moto"`). Additivo, nessun backfill.
  Migrazione: `20260826120000_add_group_moto_lesson_type`.

## Modulo condiviso
`lib/autoscuole/moto-lesson-type.ts` (client-safe, niente `"use server"` → usabile
da form, dialog e agenda):
- `MOTO_LESSON_TYPES = ["birilli","strada"]`, tipo `MotoLessonType`.
- `MOTO_LESSON_TYPE_LABELS` (Birilli / Strada), `MOTO_LESSON_TYPE_HINTS`
  ("Area chiusa · coni" / "Guida su strada").
- `asMotoLessonType(value)` normalizza un valore sconosciuto → `MotoLessonType | null`.
- `motoLessonTypeLabel(value)` → etichetta o `null`.

## Files
| File | Ruolo |
|------|-------|
| `lib/autoscuole/moto-lesson-type.ts` | costanti + label + normalizzatori (fonte unica) |
| `lib/actions/autoscuole.actions.ts` | `createAppointmentSchema.motoLessonType` (`z.enum(MOTO_LESSON_TYPES).nullable().optional()`) + persistenza in create; `updateAppointmentDetailsSchema.motoLessonType` + `updateData.motoLessonType`; `motoLessonType: true` nel `select` degli appuntamenti del bootstrap agenda (+ `motoLessonType: null` sul placeholder `gl-empty:`) |
| `components/pages/Autoscuole/EditAppointmentDialog.tsx` | selettore Birilli/Strada (gate `isMotoLesson` = veicolo moto **o** allievo con patente moto), tap-to-clear; `EditAppointmentDialogAppointment.motoLessonType`; salva via `updateAutoscuolaAppointmentDetails` |
| `components/pages/Autoscuole/AutoscuoleAgendaPage.tsx` | `form.motoLessonType` + selettore nel popover creazione (gate `bookingMode === "moto"`); campo nel payload `createAutoscuolaAppointment`; `AppointmentRow.motoLessonType`; badge pill sul blocco (viste settimana + giorno) + riga "Guida moto: …" nei due popover di dettaglio; passa il campo a `handleOpenEdit`. **REG-406**: `AppointmentRow.groupLessonMotoType` (sorgente = container, non il posto); il badge/riga usano il tipo *effettivo* (`groupLessonMotoType` per i `group_lesson`, `motoLessonType` per le individuali) → stesso badge anche sulle card gruppo-moto (arancio) |

### Gruppo moto (REG-406)
| File | Ruolo |
|------|-------|
| `lib/actions/autoscuole.actions.ts` | `createGroupLessonSchema`/`updateGroupLessonSchema.motoLessonType` (`z.enum(MOTO_LESSON_TYPES).nullable().optional()`), persistito nel ramo **moto** di `createGroupLesson`/`updateGroupLesson` (null per gli standard); `getGroupLesson`/`getGroupLessonsForAgenda` lo espongono; bootstrap agenda: `groupLessonMotoType` su righe reali + placeholder `gl-empty:` (mappa `agendaGlInfo` + helper `fetchGroupLessonFill`) |
| `components/pages/Autoscuole/dialogs/GroupLessonCreateDialog.tsx` | selettore Birilli/Strada in modalità Moto, passato in `createGroupLesson({motoLessonType})`; reset al cambio kind/chiusura |
| `components/pages/Autoscuole/dialogs/GroupLessonManageDialog.tsx` | riga editor inline "Tipo guida moto" (solo `kind="moto"`), salva via `updateGroupLesson({motoLessonType})`; tap-to-clear |
| `lib/actions/autoscuole-availability.actions.ts` | `getGroupLessonInvites`: `motoLessonType` nel `select` del gruppo + nella serializzazione dell'invito → l'allievo vede birilli/strada mentre sceglie a quale iscriversi (visibilità allievo) |

## Comportamento
- **Creazione** (`AutoscuoleAgendaPage`, popover "Nuovo appuntamento"): il
  selettore compare **solo in modalità Moto** (`bookingMode === "moto"`), sotto
  il toggle Auto/Moto. Il valore viaggia in `createAutoscuolaAppointment`
  (`motoLessonType: isMotoMode ? form.motoLessonType : null`). Reset al cambio
  modalità e dopo il submit.
- **Modifica** (`EditAppointmentDialog`): selettore mostrato quando la guida è
  moto (`primaryIsMoto` oppure allievo con patente moto). Fuori da una guida moto
  il valore viene azzerato (`effectiveMotoLessonType`). Salva via
  `updateAutoscuolaAppointmentDetails({ motoLessonType })` (metadato libero,
  nessun vincolo di stato).
- **Agenda**: badge pill bianca semitrasparente (icona cono per birilli, strada
  per strada) sotto la riga "Patente" nei blocchi guida individuali (settimana +
  giorno). I gruppi (`type === "group_lesson"`) non lo mostrano mai. Nei popover
  di dettaglio dell'evento compare la riga "Guida moto: Birilli/Strada".

## Mobile
- **Istruttore/titolare** (REG-406): sceglie il tipo in creazione guida di gruppo
  moto (`CreateGroupLessonScreen`), lo vede read-only in gestione
  (`manage-group-lesson.tsx`) e come badge in agenda (`DayItinerary`).
- **Allievo** (guide di GRUPPO moto): vede il tipo birilli/strada in tre punti —
  (1) **inviti** (`GroupLessonInvitesScreen`, per scegliere a quale iscriversi):
  `getGroupLessonInvites` serializza `motoLessonType` → `GroupLessonInvite.motoLessonType`
  → riga sulla card; (2) **dettaglio** guida di gruppo (`group-lesson-detail.tsx`,
  da `getGroupLesson().motoLessonType`) → riga "Tipo guida"; (3) **home**
  (`AllievoHomeScreen`, card guida prenotata, da `AutoscuolaAppointment.groupLessonMotoType`)
  → chip compatto. Terminologia/icone dal modulo `src/utils/motoLessonType.ts`.
- **Allievo — guide moto INDIVIDUALI**: vede birilli/strada in due punti — (1)
  **home** (`AllievoHomeScreen`, chip nel footer della hero card della prossima
  guida) e (2) **dettaglio** guida (`app/(tabs)/home/lesson-detail.tsx`, riga
  "Tipo guida"). Richiesto un fix BE: il ramo `light` di
  `getAutoscuolaAppointmentsFiltered` (usato da `AllievoHomeScreen`, `light:true`)
  non selezionava `motoLessonType` → aggiunto al `select` (il ramo non-`light`
  con `include` lo aveva già). Le mini-card orizzontali restano senza (troppo
  compatte; il tap apre il dettaglio che lo mostra).

## Connected features
- [appointments.md](appointments.md) — il campo vive sull'`AutoscuolaAppointment`
  e si salva coi canali standard create/updateDetails.
- [vehicles.md](vehicles.md) / `license.ts` — "guida moto" = veicolo o patente
  allievo in categoria moto (`isMotoLicenseCategory`).
- [group-lessons.md](group-lessons.md) — REG-406: le guide di gruppo moto
  (`kind="moto"`) hanno lo stesso tipo sul container; badge in agenda, selettore
  in creazione + modifica. Mobile ancora fuori scope (follow-up).
- [appearance-settings.md](appearance-settings.md) — indipendente: il criterio
  colore agenda (durata/patente) non tocca il badge birilli/strada, che è sempre
  visibile a prescindere dal criterio.
