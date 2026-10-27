# REG-636 — Guide di gruppo moto: cambiare la moto di ogni partecipante

## Cosa è stato fatto (2026-10-27)
- **Backend**: regole pure `planMotoChange` / `motoChoicesForSeat` in `lib/autoscuole/group-moto.ts` (+ test unitari); azione `setGroupLessonParticipantMoto` (transazione con `FOR UPDATE`, scambio confermato, rotazione); route `POST /api/autoscuole/group-lessons/[id]/participant-moto`; `getGroupLesson` espone allo staff la patente di ogni allievo.
- **Web**: selettore moto sotto il nome nel roster di `GroupLessonManageDialog` (`GroupMotoPicker.tsx`) + conferma di scambio dentro la riga, con avviso quando l'altro allievo passa ad «A rotazione».
- **Mobile**: chip moto nel roster partecipanti → picker `select-options` → `Alert` nativo per lo scambio; titolare in modalità titolare: roster «solo moto».
- **e2e** Playwright `tests/e2e/reg636-moto-partecipanti.auth.spec.ts` (API + UI), verde. Fixture dev aggiunta: allievo «Gino Neri» A2 in «Reglo E2E».
- Nessuna migrazione DB. Nessuna notifica.

## Decisioni (Tiziano)
1. Funzione **fissa**, nessuna impostazione.
2. Per titolare, segreteria (titolare/admin) e istruttore (non admin: solo guide proprie o co-istruite); su web e app. Su mobile anche il titolare in modalità titolare (eccezione alla sola lettura, solo per le moto).
3. Selettore con SOLO le moto della guida compatibili con la patente; «A rotazione» sempre selezionabile.
4. Moto già di un altro → **scambio con conferma**. Se l'altro non può guidare la moto liberata → passa ad «A rotazione», e la conferma lo dice prima («Mario passerà ad A rotazione: non può guidare la XY»).
5. Nessuna notifica all'allievo (oggi non ne esistono per i cambi veicolo).
6. Design approvato da anteprime HTML (`/tmp/hiro-anteprime/reg-636/`).

## Piano originale

### Fase 1 — Backend
Azione + route mobile, validazioni (flotta, patente, guida moto programmata), scambio atomico in transazione, patente allievo in `getGroupLesson`.

### Fase 2 — Web
Selettore nel roster del dialog «Gestisci guida di gruppo» + conferma scambio inline.

### Fase 3 — Mobile
Tipi + API, chip moto + picker nativo + Alert di conferma, modalità titolare.

### Fase 4 — Verifica e doc
e2e Playwright, screenshot ritagliati, doc `features/group-lessons.md` + `impact-map.md` su entrambi i repo.

## Riuso dalle guide singole
`vehicleServesLicense`, `motosTakenByParticipants`/lock `FOR UPDATE` delle iscrizioni, riallineamento della riga `AppointmentVehicle` primaria; web `DropdownMenu`/stili proto; mobile `optionsPickerStore` + `select-options` (come `manage-lesson-vehicles`), `vehicleServesStudent`.
