# Round pre-seed nel backoffice

## Cosa è stato fatto (2026-10-25, su staging)
Sezione `/backoffice/round`: Panoramica (obiettivo 1 M€, numeri chiave,
imbuto, prossimi passi, per tipologia, ultime attività) e Investitori (lista per
tipologia e sottocategoria, ricerca, filtri, stato e «chi» a un clic, scheda
modificabile con storico, aggiunta, esclusione con motivo obbligatorio).
Migrazione `20261028120000_round_preseed` e import dei 166 contatti su staging.
Dettagli: `docs/features/round-preseed.md`. Prod: non ancora (serve il via).

## Piano approvato
1. Modello e import (migrazione + seed prima su staging)
2. Anteprime del design (Playwright, 1280 e 390)
3. Dashboard e lista con cambi veloci
4. Scheda con storico, aggiunta, esclusione
5. QA su staging, HIRO_SHOT, doc
6. Prod solo col via: `migrate:prod` → seed prod → push su main

Stima: 3 punti (metro: REG-413 Finanza).

## Decisioni di Tiziano
- Owner dei «Contattati da noi»: Tiziano, Hiro dove il contatto è un modulo o
  una mail mandata da Hiro. Modificabile da scheda e lista.
- Sottocategoria = campo «tipo» del csv, modificabile.
- «Bloccato» = stato a parte, contato da solo in dashboard.
- Le «ondate» sono abolite ovunque.

## Emendamenti durante il lavoro
- Tornare indietro sul percorso principale corregge l'imbuto (un clic
  sbagliato su «Ha risposto» non resta contato); «No», «In pausa» e
  «Bloccato» non tolgono tappe.
- Le anteprime sono state fatte sull'implementazione vera (dev locale contro
  il DB di staging), non su un prototipo a parte, perché Tiziano ha chiesto di
  procedere fino a staging.

## Emendamento 2026-10-25 — versione grafica

Feedback di Tiziano dopo il rilascio: «troppo complesso». La UI diventa
totalmente grafica: una ciambella interattiva (per stato o per tipologia) con
al centro l'obiettivo; la lista compare solo al clic su una fetta. Niente
migrazioni, stessi dati. Su indicazione di Tiziano il rilascio è andato dritto,
senza anteprime da approvare. Dettagli in `docs/features/round-preseed.md`
§ Interfaccia.
