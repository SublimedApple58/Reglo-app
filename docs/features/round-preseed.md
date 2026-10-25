# Backoffice — Round pre-seed

L'outreach agli investitori del pre-seed da 1 M€. Sezione `/backoffice/round`,
voce «Round» nell'header dopo Finanza. Solo backoffice: dati riservati.

Analisi e piano approvati da Tiziano il 2026-10-25. Decisioni:
- **Le «ondate» non esistono**: niente colonna, filtro o etichetta. L'import
  toglie la parola dai testi e si ferma se ne resta traccia.
- **Chi se ne occupa**: Tiziano, Gabriele o Hiro, modificabile da lista e scheda.
- **Sottocategoria** = etichetta libera (all'import il campo «tipo» del csv).
- **«Bloccato» è uno stato a parte**, contato da solo nella dashboard, con il
  motivo obbligatorio.
- **Escludere richiede sempre un motivo** (form + CHECK nel database). Un
  escluso si riammette. Gli esclusi stanno fuori da tutti i conteggi.
- CDP Venture Capital e Azimut (conflitto: Guidoio) entrano già esclusi.

## Permessi

- Pagine sotto il layout del backoffice (`requireGlobalAdmin`).
- **Ogni server action ripete `requireGlobalAdmin`** (il layout non protegge
  le action). Nessuna route `/api`, nessun link pubblico, `force-dynamic`.
- L'autore nello storico è il nome dell'accesso personale; col vecchio accesso
  condiviso compare «Accesso condiviso».

## Modello (migrazione `20261028120000_round_preseed`, solo tabelle nuove)

- `FundraisingRound`: nome e obiettivo in centesimi (oggi uno: «Pre-seed 2026»,
  1 M€). `getActiveRound()` = il primo creato.
- `RoundInvestor`: anagrafica, `category` (6 tipologie), `subcategory`,
  `status`, `owner`, `channel` + `channelDetail`, `leadRole`, `priority`,
  `blockedReason`, `commitmentCents`, `lastContactOn`, `nextStepOn` +
  `nextStepNote`, `excludedAt` + `excludedReason`, `importKey` (unica per
  round). Valori a scelta chiusa come TEXT: l'elenco è in
  `lib/round/round-constants.ts`.
- **Tappe dell'imbuto** (`contactedOn`, `respondedOn`, `callOn`,
  `interestedOn`, `committedOn`): le scrive `milestonesAfterStatus`.
  - Uno stato aggiunge le tappe che implica (un «no» = hanno risposto).
  - Tornare indietro sul percorso principale (contattato → … → impegno) è una
    correzione e toglie le tappe successive.
  - «No», «In pausa» e «Bloccato» non tolgono niente: un no dopo la call resta
    una call.
  - «Da contattare» azzera.
  - Una voce di storico (call, risposta, messaggio…) aggiunge e basta
    (`onlyAdd`), e aggiorna «ultimo contatto».
- `RoundInteraction`: lo storico. I cambi di stato e di «chi se ne occupa» si
  scrivono da soli (`kind = "stato"`).

## Conteggi

`summarize()` (puro, testato in `tests/unit/round-constants.test.ts`): per stato,
per tipologia, imbuto, tasso di risposta = risposte / contattati, impegnato =
somma di `commitmentCents` dei soli «Impegno».

## File

| Cosa | Dove |
|---|---|
| Costanti, imbuto, conteggi | `lib/round/round-constants.ts` |
| Letture | `lib/round/round-data.ts` |
| Scritture | `lib/actions/round.actions.ts` |
| Pagine | `app/[locale]/backoffice/round/` (Panoramica, Investitori) |
| UI | `components/pages/Backoffice/round/` (`RoundOverviewPage`, `RoundInvestorsPage`, `InvestorSheet`, `round-ui`) |
| Import | `scripts/round-preseed/export-outreach.py` + `scripts/seed-round-preseed.ts` |

La scheda si apre con `?scheda=<id>` (link dalla dashboard). La lista accetta
anche `?stato=`, `?tipologia=` e `?ordine=prossimo`.

## Import

I file stanno in `~/Developer/reglo-deck-raccolta-2026/outreach` (fuori dal repo).

1. `export-outreach.py` li legge e scrive un JSON grezzo, da tenere nello
   scratchpad e mai nel repo.
2. `seed-round-preseed.ts --data=… --dry-run` stampa il resoconto senza scrivere.
3. Senza `--dry-run` importa. Su prod serve anche `--prod`.

È idempotente: chi c'è già non si tocca, con `--update` si riscrivono i campi.
Le risposte note fino al 25/10 (B Heroes, Startup Geeks, Nana Bianca, Foresti,
Belleri, IFF) sono scritte nello script.

Stato: staging (migrazione + import 2026-10-25). Prod non ancora.
