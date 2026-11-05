# REG-725 — Stessa patente in più luoghi + cambio per luogo

> **Stato (05/11/2026)**: fasi 1–4 fatte, **su STAGING** (web `ecf029f`,
> migrazione `20261110120000_location_license_transmissions` applicata su staging).
> Prod e OTA **non** fatti: aspettano il via di Tiziano.
> Branch `feat/reg-725-luoghi-patenti-cambio` su entrambi i repo
> (web `reglo-worktrees/reg-725`, mobile `reglo-mobile-worktrees/reg-725`, commit
> locali `49eab77` + `5e48d34`, non pushati).
>
> **Cosa è stato fatto**
> - Backend: colonna `licenseTransmissions`, via l'esclusività, regola nuova nel
>   resolver puro (31 test) e nei tre punti server (prenotazione allievo, waitlist,
>   gruppi; ambiguo → sede).
> - Web: modale con «Patenti e cambio» e corpo scorrevole (intestazione e piede
>   fissi; aggiunta su richiesta di Tiziano dopo l'ok al design), card con riga di
>   testo, agenda e guide di gruppo con campo vuoto se ambiguo e compatibili in cima.
>   Fix collaterale: la tendina dei suggerimenti indirizzo non si apre più da sola.
> - Mobile: copia 1:1 del resolver, BookingForm e foglio «Cambia luogo».
> - E2E su staging: `reg725-luoghi-patenti-cambio` (4) + `reg705-luoghi-allievo` (3)
>   verdi; `group-lesson-location` rosso per «Una moto della flotta non è disponibile
>   per questo istruttore» (controllo veicoli, prima del luogo: dati di staging).
> - Anteprime approvate: `/tmp/hiro-anteprime/reg-725/anteprima.html`; catture
>   della UI vera in `/tmp/hiro-anteprime/reg-725/staging/` e `.../maestro/`.

## Obiettivo
1. Lo stesso tipo di patente può stare in **più luoghi** (cade l'esclusività di REG-409).
2. Per ogni patente di un luogo si sceglie il **cambio**: entrambi, solo manuale, solo
   automatico. Vale per tutte le famiglie: auto, quadricicli, moto (AM/A scooter), camion, autobus.

## Decisioni di Tiziano (05/11)
- **Luoghi dell'allievo, solo se compatibili** con patente + cambio della guida:
  principale compatibile → quello; altrimenti, se **uno solo** degli altri suoi luoghi
  (REG-705) è compatibile → quello; se più d'uno dei suoi è compatibile → il principale
  se lo è, altrimenti si passa alla regola dei luoghi dell'autoscuola.
- **Luoghi dell'autoscuola compatibili**: uno solo → quello; più d'uno → la sede se è
  tra questi, altrimenti **nessuna precompilazione** (campo vuoto, compatibili in cima).
- Nessun luogo compatibile → sede (come oggi).
- Il BookingForm dell'app istruttore applica la regola **adesso** (non follow-up).

## Regola completa (resolver puro)
«Patente della guida» = categoria del veicolo se scelto, altrimenti percorso dell'allievo
(invariato). «Cambio della guida» = `transmission` del veicolo se scelto, altrimenti
dell'allievo; ignoto = qualsiasi cambio va bene. Luogo **compatibile** = ha la patente e
il cambio (patente senza restrizione = entrambi). Interruttore spento o patente ignota →
nessun filtro: precedenza di oggi (default allievo → sede).

1. Luogo principale dell'allievo, se compatibile.
2. Unico luogo compatibile tra i luoghi dell'allievo (`CompanyMemberLocation`).
3. Unico luogo compatibile dell'autoscuola.
4. Più compatibili: sede se compatibile, altrimenti `null` (UI: campo vuoto).
5. Nessun compatibile: sede.

Backend (prenotazione allievo, waitlist, gruppi senza luogo dal client): al passo 4 con
`null` si ricade sulla **sede**, perché lì un valore serve sempre. Prima di tutto resta il
luogo della fascia (REG-705), come oggi.
Gruppi: un luogo è compatibile se lo è per **tutti** i veicoli (flotta moto); i luoghi
degli allievi contano se sono concordi (regola di oggi, letta con la compatibilità).

## Fase 1 — Dati e backend (`reglo/`)
- Migrazione additiva: `AutoscuolaLocation.licenseTransmissions Json @default("{}")`,
  mappa `{ "B": "automatic" }`; chiave assente = entrambi. Nessun backfill: i dati di oggi
  valgono «entrambi», che è il loro significato attuale.
- `setLocationLicenseCategories` → salva categorie + cambi **senza** toglierli agli altri
  luoghi; ripulisce i cambi delle categorie tolte. `softDeleteLocation` azzera entrambi.
- Zod in `autoscuola-locations.actions.ts` e nelle route `/api/autoscuole/locations*`:
  `licenseTransmissions?` (solo categorie presenti, valori `manual|automatic`).
- `withoutLicenseCategories` svuota anche i cambi (interruttore spento).
- Resolver puro `location-for-license.ts`: `lessonTransmission`, `compatibleLocationIds`,
  nuova `resolvePrefilledLocationId` (ritorna anche `candidates` per la UI) e
  `resolveGroupPrefilledLocationId`; nuovi input `studentLocationIds`, `student.transmission`,
  `vehicle.transmission`. Test unitari riscritti sui casi sopra.
- `resolveStudentBookingLocationId` / `resolveGroupLessonLocationId`: caricano anche
  cambi, `transmission` e luoghi dell'allievo; fallback sede al passo 4.

## Fase 2 — Web titolare (`reglo/`)
- `LocationFormDialog`: sezione «Patenti e cambio» come da anteprima `p1` — tasti
  squadrati (radius 8, non più pillole), niente tratteggio né «selezionala per
  spostarla»; sotto, elenco «Cambio» con una riga per patente scelta (nome, «Anche su …»
  / «Solo qui», controllo segmentato Entrambi · Manuale · Automatico). Apertura riga
  260 ms in altezza, cursore 240 ms, curva senza overshoot; nessun reduced-motion.
  Sotto 520px il controllo va a capo a tutta larghezza.
- `LocationsSection`: le etichette delle patenti diventano riga di testo secondaria
  «Patenti  B solo automatico · A1 · A2» (`p2`); nuovo testo dell'interruttore.
- Agenda (`AutoscuoleAgendaPage`) e `GroupLessonCreateDialog`: passano cambio e luoghi
  dell'allievo; con più compatibili il campo resta vuoto e il menu mostra in cima
  «Fanno <patente> <cambio>», poi «Altri luoghi» (`p3`).

## Fase 3 — Mobile istruttore/titolare (`reglo-mobile/`)
- Tipi `regloApi.ts`: `AutoscuolaLocation.licenseCategories` + `licenseTransmissions`
  (arrivano già da `GET /api/autoscuole/locations`, oggi ignorati).
- `src/utils/locationForLicense.ts`: copia 1:1 del resolver puro web (stessi casi di test).
- `BookingForm`: precompila con la regola alla scelta di allievo e al cambio di veicolo
  (finché il Luogo non è toccato a mano, come il web); campo vuoto quando ambiguo.
- Foglio di scelta luogo: sezione «Fanno …» in cima quando c'è una patente nota
  (FormSheet esistente, nessun nuovo componente).
- Dato verificato via Maestro / test; OTA solo runtime 2.4.0 dopo il tuo ok.

## Fase 4 — Verifica, doc, rilascio
- Unit (resolver web + mobile), typecheck, lint; e2e `group-lesson-location` e una nuova
  spec per la modale (assegnazione B su due luoghi + cambio).
- Doc: `docs/features/locations.md` (esclusività → multi-luogo + cambio),
  `reglo-mobile/docs/features/` del BookingForm, INDEX/impact-map.
- Flusso: merge `origin/staging` nel branch → staging → `migrate:staging` → QA → prod
  (`migrate:prod`, poi OTA iOS e Android 2.4.0).

## Domande aperte
- Nessuna bloccante. Da confermare sulle anteprime: testi («solo automatico», «Anche
  su …», «Solo qui»), tasti squadrati al posto delle pillole attuali.
