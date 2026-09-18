# Sede e luoghi guida

Sede dell'autoscuola (luogo di default di ogni guida) + luoghi extra da cui le guide possono partire. Gestiti dal pane Impostazioni → "Sede e luoghi"; mostrati agli allievi nel dettaglio della guida (Google Maps se posizione precisa).

## Modello dati (Prisma)

`AutoscuolaLocation`: `companyId`, `name`, `isDefault` (la sede, una per company), `isPrecise`, `address`, `latitude`/`longitude` (Decimal), `placeId` (Google), `createdByUserId` SetNull, **`licenseCategories String[]`** (REG-409: tipi di patente serviti dal luogo).

## Luogo per tipo di patente (REG-409)

Il titolare assegna a ogni luogo (sede compresa) uno o più **tipi di patente**;
creando una guida il campo "Luogo" si precompila di conseguenza.

- **Esclusività**: una categoria appartiene a UN solo luogo per company —
  altrimenti il precompile sarebbe ambiguo. Applicata in transazione da
  `setLocationLicenseCategories` (`lib/autoscuole/locations.ts`): assegnare una
  categoria a un luogo la TOGLIE agli altri. Il picker mostra le categorie già
  prese in grigio (cliccabili: selezionarle le sposta).
- **Archiviazione**: `softDeleteLocation` azzera `licenseCategories`, altrimenti
  un luogo eliminato terrebbe in ostaggio la categoria.
- **Resolver** (puro, testato): `lib/autoscuole/location-for-license.ts`.
  - `lessonLicenseCategory(student, vehicle)` — la patente della guida è quella
    del **veicolo** se selezionato (è il veicolo a fare la guida: un allievo A2
    su una moto A1 fa una guida A1), altrimenti il percorso dell'allievo.
  - `resolvePrefilledLocationId(...)` — **precedenza**:
    1. luogo di default dell'ALLIEVO (REG-392, `CompanyMember.defaultLocationId`,
       solo se il luogo esiste ancora)
    2. luogo assegnato alla PATENTE della guida
    3. SEDE (`isDefault`)
  - Doppia assegnazione (possibile solo per scrittura concorrente): vince il
    primo della lista, che arriva ordinata `isDefault desc, name asc` → esito
    deterministico, mai casuale.
- **Granularità**: solo la categoria patente, nessuna distinzione manuale/
  automatico ("B" copre entrambi). Diverso dalla palette colori agenda, dove
  "B autom." è una voce a sé.
- **Agenda web** (`AutoscuoleAgendaPage`): ricalcolo al cambio **allievo**
  (sempre, azzerando il flag) e al cambio **veicolo** (solo se il titolare non
  ha scelto il Luogo a mano — `createLocationTouchedRef`). Toccare il select
  alza il flag; cambiare allievo lo azzera (cambio di contesto completo).
- **Fuori scope**: l'auto-prenotazione dell'allievo da app (`createBookingRequest`,
  `respondWaitlistOffer`) continua ad assegnare **sempre la sede** — non ha un
  campo Luogo da precompilare e già oggi ignora anche il default REG-392.
- **Mobile**: `GET /api/autoscuole/locations` espone già `licenseCategories`, ma
  il `BookingForm` dell'agenda istruttore **non lo consuma ancora** (scelta
  esplicita: REG-409 è stato chiuso web-only). Lì il precompile resta
  default allievo → sede.

## Backend — API routes

- `GET/POST /api/autoscuole/locations` — lista / crea luogo custom
- `PATCH/DELETE /api/autoscuole/locations/[id]` — modifica / elimina luogo custom
- `PUT /api/autoscuole/locations/default` — upsert della sede (solo titolare)

Create/update/default accettano `licenseCategories?: LicenseCategory[]`
(validato su `LICENSE_CATEGORIES`); ometterlo lascia le categorie invariate.

## Web (pane Impostazioni, redesign 2026-07-12 dal proto #config-tab-sede)

- `components/pages/Autoscuole/locations/LocationsSection.tsx` — pane: onboarding se la sede manca O non è mai stata configurata (illustrazione `public/images/settings/sede-autoscuola.png` 172px + CTA navy "Imposta la sede"), poi card "Sede dell'autoscuola" (link Modifica sottolineato, hover thickness 2) + card "Altri luoghi guida" (Aggiungi, righe #fafafa con pin navy, bottoncini 32px Maps/matita/cestino, empty state grigio).
- Sezione **"Tipi di patente"** nella modale (REG-409), in fondo, dopo
  l'Indirizzo. Il resto della modale NON è toccato.
  - I gruppi (`licenseCategoryGroupsForMode`, in `lib/autoscuole/license.ts` —
    Auto/Moto/Camion/Autobus + Qualificazioni per i consorzi) si **impacchettano
    in orizzontale** (`flex-wrap` sulle celle, non una colonna di sezioni): le 10
    patenti stanno in due righe. Regge anche la lista consorzio.
  - **Palette neutra** (richiesta esplicita, 2026-09-18: niente arcobaleno).
    Non selezionata = tasto su fondo tenue `#f4f5f7` — la superficie dei campi
    della modale — **senza bordo**: a 28px di altezza il contorno fa più rumore
    del contenuto. Selezionata = accento nero `#111111` + ombra in tinta scura
    (la regola "la separazione la fa la profondità", in monocromatico).
    Già assegnata a un altro luogo = tratteggio diagonale grigio + tooltip col
    nome del luogo; resta cliccabile e selezionarla sposta la patente qui.
  - **Contatore** `N ASSEGNATE` in linea col titolo e **hint contestuale** di una
    riga sola che NOMINA la prima patente presa da un altro luogo (`firstTaken`),
    invece di ripetere la regola in astratto. Senza conflitti l'hint ricorda che
    il luogo di default dell'allievo ha la precedenza.
  - Il riquadro riusa il bordo del box "Posizione precisa" (`1.5px #ededed`,
    radius 12): nessun contenitore nuovo.
  - **Storia**: la prima versione era una colonna di gruppi con chip outline e
    tre righe di spiegazione (bocciata: banale e dispersiva); la seconda usava i
    colori patente di `LICENSE_COLOR_ENTRIES` (bocciata: troppo colore). Se
    qualcuno ci ritorna sopra, il vincolo è: denso, neutro, niente tinte.
- Le card della lista mostrano i tag delle patenti assegnate; il segnaposto
  "Nessuna patente assegnata" compare SOLO se almeno un luogo ha delle categorie,
  così chi non usa la funzione non vede placeholder vuoti.
- La lista categorie dipende da `consortium`, passato
  `AutoscuoleResourcesPage` → `SettingsTab` → `LocationsSection`.
- `components/pages/Autoscuole/locations/LocationFormDialog.tsx` — modale proto (`sedeModalOpen`): card 480px radius 20, header centrato con illustrazione (sede-autoscuola per la sede, `luogo-guida.png` per i luoghi), X tonda #f7f7f7, input su fondo `#f7f8fa` (focus bordo near-black + fondo bianco), riga toggle "Posizione precisa" (InlineToggle navy), campo Indirizzo con lente + autocomplete **Google Places** (session token, debounce 350ms, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; senza chiave il campo è disabilitato con hint), footer Annulla + CTA pill navy `#1a1a2e` ("Salva luogo", grigia `#c4c4d4` finché invalida, `LoadingDots` in salvataggio).
- Voce sidebar Impostazioni: icona `FoldedMapIcon` SVG inline (mappa piegata SQUADRATA del proto; lucide `Map` è la variante arrotondata, sbagliata).
- **Gotcha onboarding**: la registrazione (company.actions / user.actions) crea SEMPRE una sede default automatica `Sede {nome}` senza indirizzo → `!sede` non basta. "Non configurata" = niente address/placeId/isPrecise E `updatedAt - createdAt < 5s`; qualsiasi salvataggio dal dialog bumpa `updatedAt` e fa sparire l'onboarding per sempre.

## Gotcha

- L'import lucide `Map` va aliasato (`Map as MapIcon`) in AutoscuoleResourcesPage: il file usa `new Map()` e l'import shadowerebbe il costruttore.
- "Posizione generica" = `isPrecise:false`: niente indirizzo/coordinate salvate (il form li azzera al submit).
- La validazione richiede coordinate agganciate da un suggerimento Places: digitare l'indirizzo senza selezionarlo non abilita il Salva.

## Connessioni

- **Appointments/booking**: il luogo è selezionabile su guide e prenotazioni (default = sede).
- **Vehicles / License**: la patente della guida (e quindi il luogo precompilato) dipende dal veicolo scelto — chi tocca `licenseCategory` sui veicoli tocca anche questo.
- **Mobile**: il dettaglio guida mostra il luogo; con `isPrecise` apre Google Maps.
