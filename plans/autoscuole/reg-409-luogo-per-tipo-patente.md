# REG-409 — Luogo per tipo di patente

> **Cosa è stato fatto** (2026-09-18, branch `tizianodifelice1/reg-409-luogo-per-tipo-patente`)
>
> In Impostazioni → Sede e luoghi il titolare assegna a ogni luogo (sede
> compresa) uno o più **tipi di patente**. In creazione guida dall'agenda web il
> campo "Luogo" si precompila con **precedenza: luogo di default dell'allievo
> (REG-392) → luogo assegnato alla patente della guida → sede**. La patente della
> guida è quella del **veicolo** se selezionato, altrimenti il percorso
> dell'allievo.
>
> **Chiuso web-only** su decisione esplicita: il mobile (`BookingForm` dell'agenda
> istruttore) non consuma ancora il campo, che però viaggia già nella risposta di
> `GET /api/autoscuole/locations` → il tocco mobile è un task a parte e non
> richiede lavoro backend.

## Decisioni prese prima di implementare

| Domanda | Scelta |
|---|---|
| Dove vive l'assegnazione | Sezione "Tipi di patente" **nella modale luogo/sede** + tag di riepilogo sulle card della lista |
| Precedenza vs default allievo (REG-392) | **Allievo > patente > sede** — il default dell'allievo è più specifico |
| Granularità | **Solo categoria patente** (B, BE, AM, A1, A2, A, C, CE, D, DE + C1/D1/CQC/ADR per i consorzi). Nessuna distinzione manuale/automatico |
| Mobile | **No**, solo web per ora |

## Fasi

### Fase 1 — DB
`AutoscuolaLocation.licenseCategories String[] @default([])` +
`prisma/migrations/20260918120000_location_license_categories/`.
Additiva, nessun backfill.

### Fase 2 — Backend
- `lib/autoscuole/location-for-license.ts` (nuovo, **puro e client-safe**):
  `lessonLicenseCategory`, `locationIdForLicenseCategory`,
  `resolvePrefilledLocationId`.
- `lib/autoscuole/locations.ts`: `setLocationLicenseCategories` — scrittura
  **transazionale** che toglie la categoria agli altri luoghi della company
  (esclusività: una categoria → un solo luogo, altrimenti il precompile è
  ambiguo). Agganciata a create/update/upsertDefault; `softDeleteLocation`
  azzera le categorie.
- `lib/actions/autoscuola-locations.actions.ts`: `licenseCategories` nei tre
  schemi Zod, validato su `LICENSE_CATEGORIES`.
- `lib/autoscuole/license.ts`: `licenseCategoryGroupsForMode(consortium)`.
- **Nessun endpoint nuovo**: `GET /api/autoscuole/locations` ritorna la riga
  Prisma intera, quindi il campo arriva già a web e mobile.

### Fase 3 — Web Impostazioni
`LocationFormDialog`: sezione "Tipi di patente" in fondo (il resto della modale
non è toccato — la modifica al file è puramente additiva). Gruppi impacchettati
in orizzontale, contatore `N ASSEGNATE`, hint contestuale che nomina la patente
presa da un altro luogo, riquadro col bordo del box "Posizione precisa".
Palette **neutra**: tasti su fondo tenue, selezione nera con ombra in tinta,
tratteggio grigio per le patenti di altri luoghi.
`LocationsSection`: tag sulle card; il segnaposto "Nessuna patente assegnata"
compare solo se l'autoscuola usa la funzione. Prop `consortium` threaded
`AutoscuoleResourcesPage` → `SettingsTab` → `LocationsSection`.

**Due giri di design scartati** (feedback in review): la prima versione era una
colonna di gruppi con chip outline e tre righe di spiegazione — bocciata come
banale e dispersiva; la seconda portava i colori patente di
`LICENSE_COLOR_ENTRIES` sui chip — bocciata perché troppo colorata. Vincolo
finale: **denso e neutro**.

### Fase 4 — Web agenda
`AutoscuoleAgendaPage`: `licenseCategories` in `AgendaLocationOption`, helper
`prefillLocationId`, flag `createLocationTouchedRef`.
Ricalcolo al cambio **allievo** (sempre, azzera il flag) e al cambio **veicolo**
(solo se il Luogo non è stato scelto a mano). Il select Luogo alza il flag.

### Fase 5 — Test e docs
`tests/unit/autoscuole/location-for-license.test.ts` (14 casi).
Docs: `features/locations.md`, `INDEX.md`, `impact-map.md`.

## Verifiche fatte

- `npx tsc --noEmit` pulito; `pnpm lint` senza errori nuovi (restano solo i
  warning preesistenti del repo).
- 14 unit test verdi sul resolver.
- **E2E manuale su dev** (Playwright, `titolare@reglo.it`):
  - salvataggio dalla modale → persistito a DB (sede `[B, BE]`, Piazzale Lotto
    `[AM, A1, A2, A]`);
  - esclusività: assegnando `A1` a Sede Bascinaella, `A1` sparisce da Piazzale
    Lotto (verificato a DB);
  - precompile agenda, con sede=`B,BE` / Piazzale Lotto=`AM,A2` / Sede
    Bascinaella=`A1` / Sede Serena=`A`:

    | Passo | Risultato |
    |---|---|
    | popover appena aperto | Sede Autoscuola Reglo E2E |
    | allievo B | Sede Autoscuola Reglo E2E |
    | allievo A1 | Sede Bascinaella |
    | allievo A | Sede Serena |
    | + veicolo A2 (Yamaha MT-07) | Piazzale Lotto |
    | luogo scelto a mano | Sede Bascinaella |
    | cambio veicolo dopo la scelta manuale | Sede Bascinaella (invariato) |

  Il dato di test temporaneo (un allievo portato a categoria `A`) è stato
  ripristinato.

## Fuori scope / follow-up

- ~~**Mobile**~~ ✅ **fatto 2026-09-19** (`BookingForm` + `types/regloApi.ts` +
  `src/utils/locationForLicense.ts`, gemello del modulo puro).
- ~~**Auto-prenotazione allievo da app**~~ ✅ **fatto 2026-09-19**: si è deciso di
  allinearle. `createBookingRequest` e `respondWaitlistOffer` usano ora
  `resolveStudentBookingLocationId` (`lib/autoscuole/locations.ts`) invece della
  query hardcoded sulla sede.

  Entrambi i follow-up sono sul branch `tizianodifelice1/reg-409-luogo-prenotazione-allievo`
  (presente su **entrambi** i repo) — piano:
  `reglo-mobile/plans/mobile/reg-409-luogo-per-tipo-patente-mobile.md`.
- **Cambio automatico**: "B" copre manuale e automatica. Se servisse
  distinguerle (come fa la palette colori agenda con la voce `autom`) va
  aggiunta una seconda dimensione.
