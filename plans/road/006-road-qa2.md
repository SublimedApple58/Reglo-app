# Piano 006 — Road QA 2: tracce, giro, punti critici, note

**Stato**: approvato da Tiziano il 30/10/2026. In corso.
- REG-664 (T2, note e tastiera) — IN PROD 30/10 (mobile 6bfde21, OTA 2.4.0 iOS b740c7ca / Android 074e026d)
- REG-665 (T1, tracce pulite e soste) — in corso
- REG-666 (T3, punti critici con mappa) — anteprima da approvare prima del codice
- REG-667 (T4, giro suggerito con mappa) — anteprima da approvare prima del codice

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
