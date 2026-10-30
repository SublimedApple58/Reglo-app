# Piano 006 — Road QA 2: tracce, giro, punti critici, note

**Stato**: COMPLETATO, tutto in prod il 30/10/2026.
- REG-664 (T2, note e tastiera) — mobile 6bfde21, OTA 2.4.0 iOS b740c7ca / Android 074e026d
- REG-665 (T1, tracce pulite e soste) — web d8acf92 (migrazione `20261104120000_road_clean_track` su prod), mobile 567b9c8 (OTA iOS d56b930b / Android e034d65e); demo: backup `~/Developer/reglo/backups/maltese-2026-10-30T14-48-03-247Z`, 176 tracce riscritte (script `chore/maltese-demo` 09fe2b0), 177 tracce agganciate (175 + 1 da riprovare in automatico dopo 24 h), 66 soste
- REG-666 (T3, punti critici a tutto schermo) — mobile 9b5e41c (OTA iOS 50e124ad / Android c6e4e2c7)
- REG-667 (T4, giro con miniatura e foglio) — mobile bd97701 (OTA iOS 1f4eca4a / Android 2de0515d); nessun backend nuovo (`POST /road/plan/route` esistente)

## Emendamenti in corso d'opera
- T1: dove Google devia o taglia dritto (strade che non ha nel grafo) restano i punti puliti; un fix «scappato» per meno di 60 s non interrompe una sosta. La prima riscrittura delle tracce demo aveva lasciato il groviglio in 65 guide (fase in sede riconosciuta anche dalla distanza, ma i fix gaussiani andavano oltre i 40 m): rifatta da capo dal backup, riconoscendo la fase dal passo di 8 s. Segno della sosta = cerchio nero con la «pausa» (il punto nero si confondeva con quelli delle segnalazioni).
- T3: i tocchi sui `Marker` di react-native-maps non arrivavano in modo affidabile → aree `Pressable` trasparenti sopra i segnaposto, riposizionate a ogni fine movimento.
- T4: riordino con `PanResponder` (il Pan di gesture-handler nel form sheet nativo non scattava); un tocco sulla maniglia sale di un posto. Il trascinamento vero non è stato verificabile con Maestro sul simulatore: da provare a mano. Il giro modificato vive in memoria (come «Segui il giro») e in Road tiene l'ordine dell'istruttore.

## Cosa è emerso dall'analisi
- Scarabocchi: nella demo li aveva creati il seed («ferma in sede» con un fix ogni 8 s sparso fino a 12 m). Con un GPS vero succede lo stesso da fermi. Nessuno puliva la traccia.
- `snap.ts` (Routes API) calcola la strada fra punti dati: non va bene per le tracce (inventerebbe il percorso). Serve il map matching.
- Note: `FormSheet` con `keyboardDismissMode="on-drag"` e nessun inset tastiera su iOS. `react-native-keyboard-controller` escluso: modulo nativo, con un OTA farebbe crashare la 2.4.0.
- Giro suggerito: tappe e tratti già in cache (REG-653); manca solo l'endpoint della linea.

## Decisioni (Tiziano, 30/10)
1. Google Roads `snapToRoads` sì (~0,07 € a guida, una volta sola), con fallback sulla sola pulizia.
2. Soste: segnaposto da 5 minuti in su.
3. Demo «Autoscuola Reglo»: riscrivere solo le tracce Road, con backup prima.
4. Ordine: T2, T1, poi le anteprime di T3 e T4 da mostrare a Tiziano prima del codice. Nessuna forzatura locale nei commit.

## T1 — Tracce pulite e soste (REG-665)
Pulizia server a fine guida (precisione > 25 m, salti, auto ferma ≥ 2 min = un punto, ≥ 5 min = sosta), aggancio Google Roads sulla traccia diradata, salvato su `RoadSession.cleanTrack`; guide già registrate calcolate alla prima lettura (o con lo script di backfill). In guida solo filtro leggero. Mobile e web mostrano «Sosta X min». Demo: script corretto, tracce riscritte (backup prima).
Emendamento in corso d'opera: dove Google devia o taglia dritto (strade che non ha nel grafo) restano i punti puliti.

## T2 — Note e tastiera (REG-664)
Correzione di sistema in `FormSheet`: `automaticallyAdjustKeyboardInsets`, `keyboardDismissMode="interactive"`, spazio tastiera su Android. Campi censiti: Dettagli guida, foglio note generico (Home/Agenda/Road/gruppi), Road «Segnala», blocco agenda (2), nuovo esame, voce del pagellino, form a riga singola.

## T3 — Punti critici con mappa (REG-666)
Copertina inquadrata sui punti critici; tocco o «espandi» → mappa a tutto schermo con foglio lista collegato (due altezze); dettaglio con miniatura e mappa centrata.

## T4 — Giro suggerito con mappa (REG-667)
Backend: linea del giro dalla cache dei tratti. Dettaglio guida futura: una riga con miniatura e «Il giro · N tappe · circa X min» + «Segui il giro»; tocco → foglio con mappa grande e tappe modificabili.

## Rilascio
Regola Road: web staging → prod, mobile simulatore → OTA solo 2.4.0 (iOS poi Android) → Linear Done.
