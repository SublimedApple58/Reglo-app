# Road 009 — Navigazione di Road sul web (REG-716)

## Cosa è stato fatto (04/11/2026)
Implementate le tre proposte approvate da Tiziano più i difetti pagina per pagina, in quattro sotto-task:
- **REG-718** tab di sezione sottolineate (Dal vivo · Oggi · Storico · Punti critici · Percorsi d'esame), sottotitolo per tab, «Impostazioni» a destra; percorsi d'esame spostati dalle Impostazioni a `?view=routes`; niente breadcrumb, un solo ritorno con il nome di dove eri.
- **REG-719** dettaglio guida: allievo e istruttore cliccabili, stato come testo, «Apri in agenda» + menu «…», su/giù con «2 di 5» (J/K); segnalazioni e tappe del giro → punto critico / percorso d'esame; punto critico aperto e filtri dello Storico nell'URL; allievi del punto → scheda allievo.
- **REG-720** scheda allievo con URL (`?student=&pane=`), tab «Road» (numeri, andamento, dove sbaglia, ultime guide, tutto lo storico); in «Note» una riga di testo al posto di striscia e pannello; via tag e link blu nella tab Note.
- **REG-721** Storico a 390 px col nome in prima riga, totale sullo storico filtrato, pillola «Completata» → testo, via badge «Nuovo» ed eyebrow maiuscoli, stato vuoto di «Oggi» con l'agenda di oggi.

Differenza dal report: la tab «Road» della scheda c'è sempre (con Road acceso e dalla fase pratica), con uno stato vuoto se l'allievo non ha ancora guide Road; nasconderla finché i dati non arrivano faceva saltare la tab aperta da link.

## Piano approvato (report di fase 1)
`/tmp/hiro-anteprime/road-web/report.md` e anteprime `proto/a-road-storico.png`, `b-dettaglio.png`, `c-allievo-road.png`.

## Note tecniche
- `components/pages/Autoscuole/road/road-nav.ts` (URL, `back`, lista per su/giù in sessionStorage), `road-nav-ui.tsx` (`RoadBackLink`, `RoadTabs`), `road-hotspot-match.ts` (abbinamento segnalazione → punto critico nel browser, 60 m, ultimi 90 giorni).
- Nessuna modifica al backend né migrazioni.
- e2e `tests/e2e/reg716-road-nav.auth.spec.ts`; aggiornati `reg644` e `reg645`.
