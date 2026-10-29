# Plan: Road — la sede è una sola, ed è obbligatoria

Stato: **COMPLETATO (30/10/2026)**: REG-655 → REG-658 tutti in produzione. Approvato da Tiziano il 29/10/2026.

## Decisioni di Tiziano (29/10)
1. Il ritorno in sede del giro non deve dipendere dal ricordarsi di mettere l'indirizzo: sulla web il **titolare** viene fermato da un foglio bloccante finché la sede non ha l'indirizzo con le coordinate.
2. Il foglio bloccante lo vede **solo il titolare**; l'istruttore sul web vede un messaggio informativo, come su mobile.
3. Basta col ripiego: la sede è solo la sede vera (`isDefault`), mai un luogo qualsiasi.
4. I luoghi compaiono sulla mappa Road web con un segnaposto **diverso** da quello della sede.
5. Vale per tutte le autoscuole (il foglio compare solo dove Road è attivo).
6. Stesso flusso del piano 003: task verificato → staging → prod senza aspettare l'ok; Done su Linear solo in prod; OTA solo sul runtime 2.4.0, niente build nativa.
7. UI: foglio premium, niente pillole, animazioni 200–300 ms senza overshoot, layout a 390 px, form sheet nativi su mobile. Anteprime in `/tmp/hiro-anteprime/road-sede/`.

## Il modello dati di oggi
- Sede e luoghi sono righe di `AutoscuolaLocation`. **La sede è la riga con `isDefault = true`**: al massimo una per autoscuola, per un indice unico parziale in SQL (`AutoscuolaLocation_companyId_isDefault_key`). I luoghi hanno `isDefault = false`.
- L'indirizzo sta in `address`, le coordinate in `latitude`/`longitude`, con `placeId` e `isPrecise`. Le coordinate ci sono solo con «Indirizzo preciso» acceso, scelto dall'autocompletamento Places.
- Si imposta da Impostazioni › Sede e luoghi (`LocationFormDialog` → `upsertDefaultLocation`). Alla registrazione nasce una sede «Sede {nome}» vuota.
- Prod al 29/10: 22 autoscuole, 3 senza sede, 14 con la sede senza coordinate; Maltese ha la sede con le coordinate.

### I ripieghi sbagliati (da togliere)
- `lib/autoscuole/road/headquarters.ts`: senza sede prende il primo luogo per nome; con la sede senza coordinate prende il primo luogo che le ha.
- `getRoadLive` (`base` della mappa live web): un luogo qualsiasi con le coordinate, anche archiviato.
- `RoadSessionDetail`: la partenza della guida ha l'icona della sede, quindi un luogo di partenza sembra la sede.

## Task

| Task | Linear | Scope | Punti |
|---|---|---|---|
| A. Sede unica: via i ripieghi, `places` nella mappa live, `headquartersMissing` | REG-655 | backend | 2 |
| B. Foglio bloccante della sede per il titolare, avviso per l'istruttore | REG-656 | web | 3 |
| C. Luoghi con segnaposto diverso, partenza senza icona della sede | REG-657 | web | 2 |
| D. Foglio informativo all'ingresso in Road | REG-658 | mobile | 1 |

### A — REG-655 (backend)
- `roadHeadquarters`: solo la sede vera e non archiviata; resta la geocodifica del suo indirizzo (cache Redis). Senza sede la linea del giro finisce all'ultima tappa.
- `getRoadLive`: `base` = solo la sede vera non archiviata con le coordinate; `places` = gli altri luoghi non archiviati con le coordinate.
- `headquartersMissing` nello stato web di Road, per il foglio di B. Mobile: `headquarters` della tab Road è già solo la sede vera.

### B — REG-656 (web)
- Road attivo e sede senza coordinate → foglio bloccante su tutte le pagine Road e su Impostazioni › Reglo Road, solo per il titolare. Niente X, niente chiusura toccando fuori.
- Indirizzo con autocompletamento (logica di `LocationFormDialog` estratta in un hook) oppure «Usa la mia posizione attuale»: indirizzo più vicino con Places API (New) `searchNearby`, stessa chiave, nessuna API nuova.
- Istruttore: messaggio informativo non bloccante.

### C — REG-657 (web)
- Sede con l'icona di oggi; luoghi con un segnaposto neutro più piccolo con il nome (mappa live ed editor dei percorsi).
- Dettaglio guida: partenza come punto semplice con l'orario.

### D — REG-658 (mobile)
- `headquarters` null → `<FormSheet>` informativo all'ingresso nella tab Road, una volta per avvio dell'app, non bloccante.

## Cosa si riusa
`LocationFormDialog` (Places autocomplete/details), `upsertDefaultLocation`, la geocodifica di `headquarters.ts`, `ROAD_IMAGES.base`, `addHtmlMarker`/`htmlElement`, su mobile `<FormSheet>`/`FORM_SHEET` e il campo `headquarters` della tab Road.

## Avanzamento
- **REG-655 in prod** 29/10 (main 4863e12).
- **REG-656 in prod** 29/10 (main a2ecced). `canEdit` = solo titolare (gli admin non possono salvare la sede); «Usa la mia posizione attuale» sceglie fra i 10 luoghi più vicini il primo con via e numero (il più vicino a volte è solo la zona).
- **REG-657 in prod** 29/10 (main ca0db2e): luoghi anche nell'editor dei percorsi; voce «Luogo» nella legenda della mappa live.
- **REG-658 in prod** 30/10: master mobile 6d12e02, OTA 2.4.0 iOS 01a189f0-3e72 / Android 01a189f0-e42e. Un foglio alla volta: l'avviso aspetta se «Appena finita» si è appena aperto (sul simulatore si sovrapponevano).
