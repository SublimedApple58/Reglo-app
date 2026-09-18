# Luogo delle guide di gruppo (REG-409, follow-up)

> **Stato:** implementato, **in attesa di QA su staging**. Nessuna verifica HTTP
> end-to-end fatta in locale: vedi "Cosa non è stato verificato" in fondo.

## Cosa mancava

Gap trovato da Tiziano: le guide di **gruppo** non avevano il campo Luogo **per
niente** — né su `AutoscuolaGroupLesson`, né nello schema Zod di
`createGroupLesson`, né nel dialog di creazione. Risultato: in un'autoscuola con
più luoghi guida, un gruppo si ritrovava sempre in sede, mentre la guida singola
sapeva già scegliere il luogo dalla patente (REG-409) e dal default dell'allievo
(REG-392).

## Cosa è stato fatto

**1. Il luogo vive sul container.** `AutoscuolaGroupLesson.locationId` (nullable,
FK `ON DELETE SET NULL`, indice) — migrazione additiva
`20260919090000_group_lesson_location`. Un gruppo è un evento solo, in un posto
solo: il luogo appartiene al container, non al singolo posto.

**2. E viene copiato su ogni posto.** L'allievo vede il luogo da
`AutoscuolaAppointment.location`, quindi tutti e 3 i punti che creano una seat lo
propagano: `createGroupLesson` (entrambi i rami), `addGroupLessonParticipant`,
`respondGroupLessonInvite`. Chi arriva dopo — aggiunto a mano o via invito — va
dove va il gruppo.

**3. Precedenza al plurale.** `resolveGroupPrefilledLocationId`
(`lib/autoscuole/location-for-license.ts`, puro e testato) legge la regola della
guida singola sapendo che gli allievi sono tanti e i veicoli pure:

1. **default degli allievi pre-inseriti**, se sono concordi — chi non ne ha uno
   non esprime preferenza e non blocca gli altri; un default che punta a un luogo
   archiviato viene ignorato;
2. **luogo della patente**, se i veicoli concordano;
3. **sede**.

Il criterio dell'unanimità vale per entrambi i passi: a preferenze in conflitto
si **scende al gradino dopo** invece di sceglierne una a caso. Con due allievi
che vogliono posti diversi, nessuno dei due ha ragione più dell'altro.

**4. In moto la patente viene dalla flotta.** Non dall'auto al seguito, che era
la strada suggerita ma è sbagliata: è un accessorio di categoria B e manderebbe
**ogni** gruppo moto al luogo assegnato alla B, cioè quasi sempre la sede
dell'auto. Flotta mista che punta a luoghi diversi → sede, e il titolare
corregge a mano.

**5. Il backend risolve anche quando il client tace.** `locationId` è opzionale
in ingresso; se manca, `createGroupLesson` applica la stessa precedenza via
`resolveGroupLessonLocationId` (`lib/autoscuole/locations.ts`, gemello di
`resolveStudentBookingLocationId`). Così il mobile — che il campo non ce l'ha —
non ricade automaticamente in sede.

**6. UI.** Select "Luogo" nel `GroupLessonCreateDialog`, sotto i veicoli e sopra
gli allievi, stessa forma del select dell'agenda. Si ricalcola al cambio di
veicolo / flotta / allievi pre-inseriti finché non lo si tocca a mano
(`locationTouchedRef`): da lì in poi vince la scelta dell'utente, esattamente
come nel form della guida singola. Le guide di gruppo **vuote** portano il luogo
anche nella riga sintetica `gl-empty:` del bootstrap agenda, che prima aveva
`location: null` per costruzione.

## Scelte da ricordare

- **Unanimità invece di "vince il primo"**: sui default degli allievi e sulle
  categorie dei veicoli. È l'unico modo di onorare REG-392 senza che il luogo
  dipenda dall'ordine in cui si sono aggiunti gli allievi.
- **Il luogo si decide alla creazione e non si ricalcola più**: chi si iscrive
  dopo eredita, non sposta il gruppo. Un evento condiviso non può cambiare posto
  perché è entrato un allievo in più.
- **`updateGroupLesson` non tocca il luogo** (e il dialog di gestione non lo
  mostra): fuori dallo scope chiesto. Per cambiarlo oggi si passa dalla singola
  seat. È il primo follow-up naturale.

## Test

- **Unitari** (`tests/unit/autoscuole/location-for-license.test.ts`, 9 nuovi su
  23 totali del file, verdi): unanimità, allievi senza default, conflitti che
  scendono di gradino, luogo archiviato, flotta concorde, flotta mista, nessun
  dato, categoria non assegnata, company senza sede.
- **E2E** (`tests/e2e/group-lesson-location.auth.spec.ts`, **mai eseguito**):
  gruppo moto → luogo delle moto, posto che eredita il luogo, scelta manuale che
  non viene ricalcolata, luogo di un'altra autoscuola rifiutato. Adattivo
  all'ambiente (se non c'è un luogo dedicato alle moto si aspetta la sede), così
  gira sia su dev sia su staging.

## Cosa non è stato verificato

Due ostacoli d'ambiente, nessuno dei due legato a questa modifica:

1. **Disco pieno** sul Mac (306 MiB liberi su 228 GiB): `npx playwright install
   chromium` fallisce con `ENOSPC`, quindi l'e2e non è mai partito.
2. **Il dev server tiene in memoria il client Prisma vecchio**: dopo
   `prisma generate` ogni chiamata che seleziona `locationId` sulle guide di
   gruppo risponde *"Unknown field `locationId` for select statement on model
   `AutoscuolaGroupLesson`"*. Serve un riavvio del dev server (è nel terminale
   di Tiziano).

Verificato invece: migrazione applicata sul DB dev e colonna presente
(`information_schema`), `tsc --noEmit` pulito, lint pulito sui file toccati,
suite unitaria completa verde.
