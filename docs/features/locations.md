# Sede e luoghi guida

Sede dell'autoscuola (luogo di default di ogni guida) + luoghi extra da cui le guide possono partire. Gestiti dal pane Impostazioni → "Sede e luoghi"; mostrati agli allievi nel dettaglio della guida (Google Maps se posizione precisa).

## Modello dati (Prisma)

`AutoscuolaLocation`: `companyId`, `name`, `isDefault` (la sede, una per company), `isPrecise`, `address`, `latitude`/`longitude` (Decimal), `placeId` (Google), `createdByUserId` SetNull.

## Backend — API routes

- `GET/POST /api/autoscuole/locations` — lista / crea luogo custom
- `PATCH/DELETE /api/autoscuole/locations/[id]` — modifica / elimina luogo custom
- `PUT /api/autoscuole/locations/default` — upsert della sede (solo titolare)

## Web (pane Impostazioni, redesign 2026-07-12 dal proto #config-tab-sede)

- `components/pages/Autoscuole/locations/LocationsSection.tsx` — pane: onboarding se manca la sede (illustrazione `public/images/settings/sede-autoscuola.png` 172px + CTA navy "Imposta la sede"), poi card "Sede dell'autoscuola" (link Modifica sottolineato, hover thickness 2) + card "Altri luoghi guida" (Aggiungi, righe #fafafa con pin navy, bottoncini 32px Maps/matita/cestino, empty state grigio).
- `components/pages/Autoscuole/locations/LocationFormDialog.tsx` — modale proto (`sedeModalOpen`): card 480px radius 20, header centrato con illustrazione (sede-autoscuola per la sede, `luogo-guida.png` per i luoghi), X tonda #f7f7f7, input su fondo `#f7f8fa` (focus bordo near-black + fondo bianco), riga toggle "Posizione precisa" (InlineToggle navy), campo Indirizzo con lente + autocomplete **Google Places** (session token, debounce 350ms, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; senza chiave il campo è disabilitato con hint), footer Annulla + CTA pill navy `#1a1a2e` ("Salva luogo", grigia `#c4c4d4` finché invalida, `LoadingDots` in salvataggio).
- Voce sidebar Impostazioni: icona `Map` (mappa piegata, come proto), non MapPin.

## Gotcha

- L'import lucide `Map` va aliasato (`Map as MapIcon`) in AutoscuoleResourcesPage: il file usa `new Map()` e l'import shadowerebbe il costruttore.
- "Posizione generica" = `isPrecise:false`: niente indirizzo/coordinate salvate (il form li azzera al submit).
- La validazione richiede coordinate agganciate da un suggerimento Places: digitare l'indirizzo senza selezionarlo non abilita il Salva.

## Connessioni

- **Appointments/booking**: il luogo è selezionabile su guide e prenotazioni (default = sede).
- **Mobile**: il dettaglio guida mostra il luogo; con `isPrecise` apre Google Maps.
