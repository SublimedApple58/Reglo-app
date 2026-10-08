# Percorsi patente (REG-458)

Un allievo può conseguire **più patenti nel tempo**: la B e poi la A, la C e poi
la CQC. Ogni percorso è una riga, non un campo sovrascritto.

## Perché esiste

Prima di REG-458 il percorso **era** l'allievo: `CompanyMember.licenseCategory`,
`transmission`, `licenseNumber` e `licenseObtainedAt`. Al secondo giro si
sovrascrivevano, e la patente precedente spariva dal dato.

In produzione la cosa era già stata aggirata a mano: **cinque persone registrate
due volte** — `md sojib`, `nico macelloni`, `onkar singh` (C + CQC),
`veronica biliotti` (D + DE) nel consorzio, `giacomo chiappe` (A1 + B) con due
account app veri. Quattro di loro hanno due email segnaposto
`@no-app.reglo.local`: la segreteria creava un secondo allievo perché non c'era
altro modo.

## Modello

`AutoscuolaLicensePath` (`prisma/schema.prisma`):

| Campo | Note |
|---|---|
| `licenseCategory` | **nullable**: 95 allievi in prod non ne hanno una (self-registered fermi al gate di REG-410). Meglio vuoto che una "B" inventata |
| `transmission` | sulle qualificazioni non si applica |
| `status` | `active` · `obtained` · `abandoned` |
| `startedAt` / `closedAt` / `obtainedAt` | `obtainedAt` può essere null anche su un `obtained`: 67 patentati su 72 non hanno mai avuto né numero né data |
| `licenseNumber` | sta qui perché è attributo della **patente**, non della persona: due percorsi, due numeri |

**Al massimo un percorso `active` per allievo.** È un **indice unico parziale**
creato in SQL grezzo nella migrazione (`..._companyId_studentId_active_key`):
Prisma non sa esprimerlo, quindi **non è gestito da lui** e va preservato a mano.
Stessa tecnica già usata per `AutoscuolaLocation_companyId_isDefault_key`.
`tests/unit/autoscuole/license-path-guard.test.ts` verifica che l'indice sia
ancora nelle migrazioni.

### Lo specchio su `CompanyMember`

I campi vecchi **restano tutti** e diventano lo specchio dell'ultimo percorso
(aperto se c'è, altrimenti l'ultimo chiuso), più `activeLicensePathId`.

È la decisione centrale del lavoro: `licenseCategory` compare **563 volte** su
~40 file (abbinamento veicolo↔allievo con le gerarchie moto/rimorchi, luogo
precompilato, tariffe consorzio, colori agenda, bucket "chi prenota dall'app",
guide di gruppo moto, gemello mobile). Toccarle era fuori discussione: con lo
specchio non ne cambia una.

### Le guide non hanno un `licensePathId`

Deliberato. Ci sono **13 punti** nel prodotto che creano appuntamenti: una
colonna da allineare su tutti e 13 si disallinea in silenzio appena ne sfugge
uno. Il percorso di una guida si ricava dalla sua data con `pathForDate()`:

> **l'ultimo percorso iniziato non dopo quella data.**

Niente finestre `[startedAt, closedAt]`, che lascerebbero scoperti i giorni fra
un percorso e il successivo: così la risposta esiste sempre ed è una sola.

## File

| Scope | File |
|------|------|
| Modulo puro (stati, etichette, `pathForDate`, `isQualification`) | `lib/autoscuole/license-paths.ts` |
| **Scritture — punto unico** | `lib/autoscuole/license-path-writes.ts` |
| Action (storico + avvio nuovo percorso) | `lib/actions/autoscuole-license-paths.actions.ts` |
| Dialogo web | `components/pages/Autoscuole/dialogs/StartNewLicensePathDialog.tsx` |
| Drawer allievo | `components/pages/Autoscuole/AutoscuoleStudentsPage.tsx` |
| Drawer consorzio | `components/pages/Consorzio/ConsorzioStudentDrawer.tsx` |
| Migrazione + backfill | `prisma/migrations/20261008180000_license_paths/` |
| Guardia | `tests/unit/autoscuole/license-path-guard.test.ts` |
| Test del modulo puro | `tests/unit/autoscuole/license-paths.test.ts` |

## La porta di scrittura

`license-path-writes.ts` muove **riga e specchio nella stessa transazione**:
`ensureActivePath`, `closeActivePath`, `openNewPath`, `updateOpenPath`,
`syncMemberMirror`. Lo specchio è **ricalcolato dai percorsi**, non aggiornato a
mano dal chiamante: così non può restare indietro, e rieseguire non cambia
niente.

Tutti e cinque gli scrittori preesistenti passano di lì:
`setExamOutcome`, `updateStudentPhase`, `updateStudentLicensePath`,
`PATCH /api/autoscuole/me/license-path` (gate REG-410),
`setAffiliateStudentLicense`. L'unica scrittura **massiva** —
`autoscuole-settings.actions.ts`, seed del default REG-424 — aggiorna allievi e
percorsi aperti con gli stessi valori nella stessa transazione, ed è l'unica
eccezione ammessa dalla guardia.

`ensureActivePath` è la rete di sicurezza per gli allievi nati **dopo** la
migrazione: i punti che creano un allievo non sono stati toccati, il percorso
compare alla prima operazione che ne ha bisogno, ricavato dallo specchio.

## Correggere ≠ ricominciare

Due gesti distinti, ed è la distinzione che prima non c'era:

- **Modifica percorso** (`updateStudentLicensePath`) — la categoria era
  sbagliata. Riscrive il percorso in corso.
- **Avvia nuovo percorso** (`startNewLicensePath`) — chiude quello in corso
  (`obtained` o `abandoned`, col numero di patente se si conosce) e ne apre uno
  nuovo, azzerando `examReady` e riportando la fase a PRATICA o TEORIA.

Ripartire da TEORIA richiede la fase attiva in autoscuola **e** un posto quiz:
il posto è a vita, quindi chi l'ha già avuto passa; a chi non l'ha mai avuto la
action lo dice invece di fallire più avanti.

## Cosa cambia per l'allievo

- **Obbligo x/6**: conta solo le guide del percorso in corso. Prima contava
  tutta la vita in autoscuola, e il secondo percorso nasceva già "completato".
- **Colori agenda**: la patente di una guida è quella del percorso **a quella
  data**. Prima era la categoria corrente dell'allievo, quindi aprire la A dopo
  la B ricolorava di moto, all'indietro, tutte le guide in auto.
  Lo storico viaggia nel bootstrap agenda **solo per chi ha più di un percorso**:
  è un percorso caldo.
- **Storico**: sezione «Patenti conseguite» nel riepilogo, visibile solo con
  almeno un percorso chiuso. Su account consorzio diventa «Percorsi conclusi»
  appena nel mazzo c'è una CQC o una ADR — non sono patenti, sono qualificazioni.
- **Push**: `license_path_started` («🚗 Nuovo percorso: patente A»). NON si
  riusa `notifyStudentPhaseChange`, che su una transizione verso PRATICA direbbe
  «Hai il foglio rosa! prenota le tue **prime** guide» a chi la patente ce l'ha.

## Il giorno del rilascio non cambia niente

Il backfill dà a ogni allievo **un** percorso ricavato dai campi che ha già
(`obtained` se PATENTATO, altrimenti `active`). Con un percorso solo, l'obbligo
copre tutte le guide e i colori restano quelli di prima. Il valore si vede dal
secondo percorso in poi.

## Il filtro del tab Guide

Le guide non hanno una colonna percorso, quindi il tab Guide puo' mostrarle
tutte insieme. La regola di cosa far vedere sta in `lessonsPathFilterId()`
(`lib/autoscuole/license-paths.ts`), non nel componente, ed e' coperta dai test:

1. **Con meno di due percorsi non si filtra, e il banner non esiste.** «Solo le
   guide del percorso B» e' una precisazione inutile quando B e' l'unico
   percorso che esiste — cioe' per quasi tutti gli allievi.
2. **Il default e' il percorso corrente** (`currentPath()`: quello aperto, o
   l'ultimo chiuso per un patentato), non il piu' vecchio.
3. Una scelta che **non esiste piu'** ricade sul default, invece di mostrare
   zero guide senza spiegazione.

Il banner ha **due stati** e in entrambi offre l'azione opposta — «Mostra
tutte» quando e' filtrato, «Solo il percorso X» quando non lo e'. Serve perche'
i conti dei sotto-filtri (Tutte/Future/…) seguono il filtro: se il percorso
corrente e' nuovo e non ha ancora guide, senza il banner sembrerebbe che il
prodotto abbia perso lo storico.

> Bug del 2026-10-09, il giorno dopo il rilascio: il tab si apriva etichettato
> sul percorso **vecchio** e il banner compariva anche con un percorso solo.
> Trovato in QA su produzione su `marco@reglo.it` (Autoscuola Maltese: A2
> conseguita, B appena avviata). Fix + test in
> `tests/unit/autoscuole/license-paths.test.ts` e
> `tests/e2e/reg458-filtro-guide.auth.spec.ts`.

## Connessioni

- → **Student Phase**: `startNewLicensePath` riporta la fase a PRATICA/TEORIA e
  azzera `examReady`. Vedi `student-phase.md`.
- → **Esito esame**: un **idoneo** ora chiude il percorso, non solo la fase.
  Vedi `exam-outcome.md`.
- → **Vehicles / License**: lo specchio alimenta `vehicleServesLicense` e tutto
  l'abbinamento. Vedi `vehicles.md`.
- → **Cases & Deadlines**: `AutoscuolaCase` è **deprecato** e resta dov'è. Non è
  il percorso. Vedi `cases-deadlines.md`.
- → **Consorzio**: la scala C → CE → CQC diventa nativa. Vedi `consorzio.md`.
