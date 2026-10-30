# Plan: Road mobile — redesign dopo la QA (piano 005)

Stato: **APPROVATO (30/10/2026)**, in corso. Task REG-659 → REG-663.

## Decisioni di Tiziano (30/10)
1. Bug Punti critici: il contenuto in fondo finisce sotto la tab bar e non si scrolla; deve stare tutto, con lo spazio della barra.
2. Home Road e Punti critici: copertina (mappa) grande in alto con il foglio del contenuto sopra; trascinando giù la mappa si allarga, mai vuoto bianco.
3. La home Road è GENERICA (Road dell'autoscuola). L'unica azione su un allievo è avviare la guida: il flusso chiede con chi guidi e poi mostra in breve le cose Road di quell'allievo. Flussi lunghi in più fogli in sequenza, mai fogli pieni.
4. La Road di un allievo si consulta dal dettaglio allievo (Allievi): riga «Road» → foglio dedicato.
5. Fogli in sequenza = form sheet nativi spinti uno sopra l'altro; trascinando giù si torna al passo prima, la X chiude tutto.
6. Copertina della home: aloni dei punti critici dell'autoscuola, ripiego su sede e posizione.
7. Un giro di anteprime (fedeli allo stile reale) prima del codice, mostrate a Tiziano; dopo il suo ok rilascio diretto con la regola Road (OTA solo runtime 2.4.0 dopo il simulatore; mobile senza staging; build solo locali se servisse).
8. Regole UI: premium, nativo iOS, ispirazione Airbnb; bianco/nero, clay leggero, niente blu, niente fondi grigi o crema; niente pillole/badge/tag/eyebrow; poche icone 3D (Gemini, prompt STILE); animazioni 200–300 ms senza overshoot, mai spente da «Riduci movimento»; §15 fluidità; fogli adattivi senza grabber con X; header nativo che collassa; skeleton e dissolvenze; CTA tonde con volume.

## Task

| Task | Linear | Scope | Punti |
|---|---|---|---|
| A. Punti critici: spazio in fondo + copertina elastica (`ClayStretchyCover`) | REG-659 | mobile | 2 |
| D. `GET /road/students/[id]`: `startedAt` e pagellino `{done,total}` per guida, `hotspots` dell'allievo (solo campi aggiunti) | REG-660 | backend | 1 |
| B. Home Road generica: stato del giorno, CTA, punti critici, ultime guide | REG-661 | mobile | 3 |
| C. Avvio guida in tre fogli in sequenza | REG-662 | mobile | 3 |
| E. Riga «Road» e foglio «Road di <allievo>» nel dettaglio allievo | REG-663 | mobile | 3 |

Ordine: anteprime → A → D (web staging → prod) → B → C → E.

## Design

### Copertina elastica
- Mappa in alto, foglio bianco con angoli arrotondati sopra. Trascinando giù (elastico nativo iOS) la mappa si ingrandisce ancorata in alto; scorrendo su sale più lenta (parallasse leggera) e `ClayNavBar overlay` diventa opaca col titolo piccolo.
- Solo `transform` sul contenitore, guidato da `useAnimatedScrollHandler`: la `MapView` è montata una volta e non cambia misura.

### Home Road (generica)
- Copertina: sede, posizione, aloni dei punti critici.
- Foglio: «Road» + stato del giorno («Oggi 3 guide · la prossima alle 15:00 · Ford Fiesta libera»); CTA nera tonda: «Avvia guida» / riga «In agenda adesso · Serena · 15:00» con «Entra in Road» e link «Avvia un'altra guida» / «Torna in Road».
- «Punti critici»: primi 3 + «Vedi tutti». «Le tue ultime guide» con il nome dell'allievo in ogni riga.
- Restano «Appena finita», avviso sede, campanella. Escono volti, briefing, «Parti con X».

### Avvio guida (tre fogli)
1. «Con chi guidi?»: ricerca, «Suggeriti» (3, motivo in grigio), «Tutti gli allievi» (FlatList nel FormSheet).
2. «<Nome> su Road»: briefing (max 3 righe), suoi punti da migliorare, ultima guida, «Il giro» + «Segui il giro», «Continua». Saltato senza storia Road.
3. «Parti con <Nome>»: durata, Auto, «Fino alle …», CTA «Parti con <Nome> · 60 min». Conferme come oggi.
- Guida in agenda: dal foglio 2 (anche invito e foglio della guida).

### Road dell'allievo
- Riga «Road» nel foglio allievo: «8 guide · 2 punti da migliorare».
- Foglio «Road di <Nome>»: numeri, una mappa coi punti da migliorare (montata dopo l'animazione), «Da migliorare», «Le sue guide» (miniatura salvata, data, numeri, «Pagellino N voci su M») → «Percorso Road»; max 5 poi «Tutte le guide».

## File
- Mobile: `src/components/clay/ClayStretchyCover.tsx` (nuovo), `src/screens/RoadHotspotsScreen.tsx`, `app/(tabs)/drive/index.tsx`, `app/(tabs)/drive/avvia*.tsx` + `_layout.tsx`, `src/road/freeStartStore.ts`, `home/road-invite.tsx`, `home/manage-lesson.tsx`, `src/components/road/*`, `src/screens/StudentNotesDetailScreen.tsx`, `src/screens/StudentRoadSheet.tsx` + `app/(tabs)/notes/road-allievo.tsx` (nuovi), tipi e servizi API, eventualmente `app/(tabs)/_layout.tsx`; docs `reglo-road.md`, `design-system.md` §0.5/§0.6, `impact-map.md`, `INDEX.md`.
- Backend: `lib/autoscuole/road/service.ts › getRoadForStudent`, test, `docs/features/reglo-road.md`.

## Registro
- 30/10: piano approvato, task creati, anteprime in `/tmp/hiro-anteprime/road-redesign/`.
- 30/10: anteprime approvate da Tiziano tranne Punti critici. Correzione chiesta: copertina e foglio scorrono insieme, niente altezza gonfiata per forzare lo scroll; con poco contenuto la mappa prende lo spazio libero e il foglio arriva alla tab bar; stato vuoto in una card composta. Nuove anteprime 09–12 in attesa del suo ok (REG-659 fermo fino ad allora).
- 30/10: ok esplicito a partire con REG-660 → 661 → 662 → 663.
