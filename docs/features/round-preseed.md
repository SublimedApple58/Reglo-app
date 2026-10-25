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
| Pagina | `app/[locale]/backoffice/round/page.tsx` (unica; `/round/investitori` reindirizza qui) |
| UI | `components/pages/Backoffice/round/` (`RoundPage`, `InvestorSheet`, `round-ui`) |
| Import | `scripts/round-preseed/export-outreach.py` + `scripts/seed-round-preseed.ts` |

## Interfaccia (grafica, 2026-10-25)

Il 25/10 Tiziano ha giudicato la prima versione, con dashboard e liste per
tipologia, «troppo complessa». Ha chiesto una pagina totalmente grafica:
«non voglio vedere liste infinite a meno che tramite interazione l'utente non
capisca di volerla vedere». Modello dati invariato, `RoundPage.tsx`. Il 25/10 sera la ciambella è diventata tridimensionale e animata, su richiesta di Tiziano («tridimensionale e animato un sacco, ma clean, niente bounce»).
- **Ciambella morbida, stile cartoon/clay** (`RoundDonut.tsx`, SVG puro + `motion/react`). Il 25/10 sera Tiziano ha scartato la versione 3D («spigolosa, futuristica, fredda»).
  - Anello spesso, estremità tonde (`stroke-linecap: round`), piccoli spazi tra le fette.
  - Profondità: ombra da sticker piatta e sfocata sotto (ferma), bordo appena più scuro, luce interna tenue. Niente prospettiva né alone.
  - Le fette piccole prendono un minimo fisso (un bollino intero, `MIN_DEG`) e il resto del giro si divide in proporzione: niente sovrapposizioni.
  - Palette pastello calda: corallo, mandarino, giallo burro, menta, lilla, rosa. «Da contattare» è sabbia. Sfondo crema (`#fffaf3`) nel layout del round. Numeri grandi in Nunito (`next/font`, variabile `--font-round`, caricato solo nel layout del round).
  - Un solo loop `useAnimationFrame` con avvicinamento esponenziale (niente overshoot). All'ingresso le fette si gonfiano una dopo l'altra (scala 0.9 → 1) mentre l'anello ruota un poco. Da ferma respira piano, con un filo di parallasse.
  - Cambio vista = morph per slot (9): archi e colori si rimodellano; i posti in più si sgonfiano e spariscono. Per questo la ciambella non va mai rimontata (niente `key={mode}`).
  - Hover: la fetta si ingrandisce appena e le altre si attenuano. La lista entra ed esce con `AnimatePresence`; scheda e foglio dal basso con le keyframe `round-sheet-*`.
  - Con `prefers-reduced-motion` tutto è fermo.
- **Mouse**: al passaggio la fetta si ingrossa e il centro mostra conteggio e
  percentuale (per tipologia anche quanti sono già avviati). Al clic, e solo
  allora, nella colonna destra la lista di quei contatti prende il posto della
  legenda; si chiude con la ×.
- **Telefono** (sotto `md`): il primo tocco mostra i numeri, il secondo (o «Vedi
  chi sono») apre la lista come foglio dal basso.
- **La legenda** sta a destra su desktop e sotto su telefono. Anche le sue voci
  aprono la lista. In fondo ci sono «Vedi tutti N» e il link discreto
  «N esclusi»: gli esclusi non compaiono nella ciambella.
- **La lista** è compatta: nome, organizzazione (oppure il motivo, se bloccato
  o escluso), stato e chi se ne occupa. Oltre gli 8 nomi compare la ricerca.
  L'ordine è per avanzamento e poi alfabetico.
- **La scheda essenziale** (`InvestorSheet`) contiene nome e organizzazione,
  stato e chi se ne occupa, prossimo passo (data e cosa fare), contatto
  (email, telefono, LinkedIn) e note.
  - Il motivo compare solo con «Bloccato», l'importo solo con «Impegno».
  - Lo storico è in sola lettura, chiuso in fondo.
  - «Escludi dal round» chiede sempre il motivo.
  - Canale, lead/follower, priorità, ticket, fit, fonte, città, sito e
    sottocategoria restano nel DB senza vedersi: il salvataggio li riscrive
    come sono.
- `quickUpdateRoundInvestor`, `addRoundInteraction` e `deleteRoundInteraction`
  restano, ma la UI oggi non li usa.
- `/backoffice/round/investitori` reindirizza alla pagina unica (porta con sé
  `?scheda`).

La scheda si apre con `?scheda=<id>`.

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
