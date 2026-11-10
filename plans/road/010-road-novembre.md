# Road 010 — Road novembre (R1…R7)

Stato: **piano approvato da Tiziano il 10/11/2026**, in corso. Nessun ticket Linear.
Branch `feat/road-novembre` su entrambi i repo; worktree `reglo-worktrees/road-novembre` (da origin/staging) e `reglo-mobile-worktrees/road-novembre` (da origin/master).
Rilascio: **solo OTA** mobile su runtime 2.4.2 e 2.4.0 (niente build nativa); web via staging → prod. Niente rilasci senza ok (Road in uso da Ricca).
Anteprime: `/tmp/hiro-anteprime/road-novembre/` — ogni parte di UI passa prima dall'anteprima approvata.

## Ordine

| # | Task | Punti | Ambito | Migrazione |
|---|---|---|---|---|
| 1 | R1 pagellino richiesto di nuovo | 1 | BE + mobile | no |
| 2 | R6 esame prenotato in cima alla scheda allievo | 1+1 | mobile + web | no |
| 3 | R5 tocco sul nome in Road → scheda allievo | 2 | mobile | no |
| 4 | R2 pagellino come livello | 3 | BE + mobile + web | no |
| 5 | R3 pin modificabili | 3 | BE + mobile + web | no |
| 6 | R7 segnalazione punto / zona | 3 | BE + mobile + web | additiva |
| 7a | R4 registrazione Road Exam | 5 | BE + mobile | additiva |
| 7b | R4 percorsi per esaminatore | 3 | BE + web + mobile | (stessa) |
| 7c | R4 provare un percorso durante una guida | 3 | BE + mobile | no |

## Decisioni di Tiziano (10/11)

1. R1: pagellino «chiuso» = almeno una voce votata; «Più tardi»/X ricordato per quella guida (persistito).
2. R2: il «livello attuale» per voce SOSTITUISCE la media nella scheda allievo (mobile e web); l'allievo lo vede nel suo pagellino.
3. R6: blocco esame anche nella scheda allievo web.
4. R3: istruttore e titolare modificano i pin SEMPRE (niente finestra 2 h); modifica anche dal web.
5. R3: «Sposta» col mirino (niente drag nativo: crash AIRMap su New Arch).
6. R7: punto di default; zona 50/100/200 m con un tocco dopo la segnalazione.
7. R7: la zona conta nei punti critici col suo centro.
8. R4: avviano Road Exam l'istruttore dell'esame, i co-istruttori e il titolare; esame senza istruttore → qualunque istruttore dell'autoscuola.
9. R4: colore = quello che oggi identifica gli esami. Trovato: web agenda viola (`#F5F0FF`, testi violet-700/800, accento `#8B5CF6`); mobile oggi neutro (`#F2F2F0`). Da confermare in anteprima.
10. R4: solo tracciato, niente segnalazioni.
11. R4: due esaminatori → il percorso sta sotto entrambi; percorsi vecchi senza esaminatore li assegna il titolare a mano.
12. Solo OTA.

## Dettagli tecnici

### R1
- Regola server `lib/autoscuole/road/service.ts` (`toClose`, ~1817): `scored >= 1` invece di `scored >= total`; stessa regola in `evaluationProgress` (~1031) e nel riepilogo mobile (`app/road/riepilogo.tsx:163`).
- Mobile `src/road/pagellinoPrompt.ts`: «già mostrato» persistito per sessione (AsyncStorage) invece del Set in memoria.

### R2 (niente migrazione: livello calcolato)
- `GET /appointments/[id]/evaluation` restituisce anche `previous[]` = ultimo voto per voce dato all'allievo nelle guide precedenti (distinct itemId, ordine startsAt desc); in cache offline di Road.
- Mobile `manage-lesson-details.tsx` + `StarRating` variante ghost: stelle attenuate + «4 su 5 · 3 nov»; il ghost non entra mai nel payload (voce non toccata = «non valutata» in quella guida).
- Scheda allievo (mobile `StudentNotesDetailScreen`, web `AutoscuoleStudentsPage` `EvaluationAverages`) e pagellino allievo (`StudentMyNotesScreen`): livello attuale al posto della media.
- Web `EditAppointmentDialog`: tutte le voci con il ghost.

### R3
- PATCH marker: accetta anche `kind` (label ricalcolata) e ricalcola `street` se cambia posizione; invalida la cache Redis dei punti critici; titolare/istruttore senza limite di tempo.
- Mobile: dettaglio pin (tipo, nota, sposta col mirino, elimina); fix race `correctRoadMarker` (passare prima dalla coda offline).
- Web: modifica dal dettaglio sessione.

### R7
- `RoadMarker.shape String?` (`point`|`zone`, null = point) + `radiusM Int?`.
- Zona disegnata come Polygon (~32 lati; `Circle` non va su New Arch) in tutte le mappe mobile e web; nei punti critici conta il centro.

### R4
- `RoadSession.mode` (`lesson`|`exam`) + `examiners String[]`; sessione d'esame ancorata a una riga dell'esame, `studentId` null; a fine sessione niente `completed`/riallineo agenda.
- `RoadExamRoute.examiners String[]`, `origin` (`drawn`|`exam`), `examAt`; a fine Road Exam il percorso si crea da solo dal tracciato pulito.
- Percorsi d'esame raggruppati per esaminatore (mobile nuova lista + web `RoadExamRoutesSection`), «Senza esaminatore» assegnabili dal titolare.
- `PUT /road/sessions/[id]/plan` per caricare un percorso d'esame a guida in corso (tappa `source:"exam"`, copertura via `planReached`).

## Avanzamento
- [ ] R1 · [ ] R6 · [ ] R5 · [ ] R2 · [ ] R3 · [ ] R7 · [ ] R4a · [ ] R4b · [ ] R4c
