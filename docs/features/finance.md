# Backoffice — Finanza (REG-413)

I conti **di Reglo** (non delle autoscuole): entrate, uscite, spese fisse,
previsioni, IVA da mettere da parte, vendite. Sezione `/backoffice/finanza`,
voce «Finanza» nell'header tra KPI e Assistenza. Protetta dal layout del
backoffice (`requireGlobalAdmin`, vedi [backoffice-access.md](backoffice-access.md)).

Si costruisce a fasi (analisi approvata da Tiziano il 2026-10-22):

| Fase | Contenuto | Stato |
|---|---|---|
| 0 | Login personali al backoffice | staging (approvata) |
| 1 | Migrazione + Movimenti + Spese fisse | staging (approvata) |
| 2 | Panoramica (margine, MRR, cassa, IVA, 12 mesi, in arrivo) | staging (approvata) |
| 3 | Autoscuole (anagrafica commerciale) | staging (approvata) |
| 4 | Vendite (sales, contratti, commissioni) | staging (mostrata) |
| 5 | Rifinitura + elenco dei dati di partenza (nessun import: i dati veri li inseriscono Tiziano e Gabriele) | staging |

## Regole decise da Tiziano

- **Solo dati veri.** Niente numeri di esempio: dove un dato manca c'è uno stato
  vuoto curato. Fuori dai conti le autoscuole interne di prova
  (`excludeFromKpis`), quelle **seminate per le demo (`seedDemo`)** — che nei KPI
  gonfiano l'MRR con piani finti — e le **consorziate** (`affiliateOf`).
  Un solo punto: `listFinanceCompanies()` in `lib/finance/finance-data.ts`.
- **Importi IVA inclusa** (i prezzi di piani e preventivi lo sono). L'IVA si
  scorpora con l'aliquota del movimento (`vatRateBps`, default 22% sulle
  entrate, «non registrata» sulle uscite). **IVA da accantonare** = IVA sugli
  incassi − IVA sulle spese registrate con aliquota.
- **Entrata del mese = incassato reale** (`status = "settled"`). MRR a parte.
- Nessuno storico MRR nella 1.0, niente Trigger.dev: le spese fisse non
  generano righe, la previsione le proietta al volo.
- Partenza da ottobre 2026 con saldo di cassa iniziale (`FinanceSettings`,
  vuoto finché non lo inserisce Tiziano).

## Modello

Migrazioni: `20261026120000_finance` (solo tabelle nuove) e
`20261027120000_finance_sales_payments` (fase 4: due colonne su `FinanceEntry`).

| Tabella | Cosa |
|---|---|
| `FinanceCategory` | Categorie in/out; `group` raggruppa le spese (persone, software, …). 12 di partenza dalla migrazione. |
| `FinanceEntry` | Movimento: `date`, `direction` in/out, `amountCents` IVA incl., `vatRateBps`, `status` settled/due/planned, `settledOn`, `companyId?` (solo entrate), `invoiceNumber?`, `recurringExpenseId?`, `salesAgentId?` (fisso pagato: `date` = 1° del mese di riferimento, `settledOn` = giorno del pagamento), `salesDealId?` (commissione pagata, unico), `createdById` (admin personale). |
| `RecurringExpense` | Spesa fissa: importo per scadenza, `cadence` monthly/quarterly/annual, `dayOfMonth`, `startsOn`/`endsOn`, archiviabile. |
| `SalesAgent`, `SalesDeal` | Fase 4. Sales: fisso mensile, % di default, archiviabile. Contratto: firma (`closedOn`), valore, % e importo commissione, `paidOn`. La commissione matura alla firma, si paga entro la fine del mese dopo. `companyName` copiato alla firma. |
| `CompanyCommercial` | Fase 3. 1:1 con `Company`: P.IVA, regione, stato commerciale, sales. |
| `FinanceSettings` | Riga unica `default`: saldo e data di partenza. |

Date di calendario `@db.Date` ↔ stringhe `YYYY-MM-DD` (`ymdToDbDate` / `dbDateToYmd`).
«Oggi» è sempre quello di Roma (`todayYmdRome`).

## Viste

- **Movimenti** (`/finanza/movimenti?mese=YYYY-MM`): mese, filtri (tipo, stato,
  categoria, ricerca), totali dei movimenti filtrati (incassato, pagato, saldo,
  da incassare con le scadute, IVA da accantonare), CSV (`;`, BOM, importi con
  segno), drawer per creare/modificare/eliminare, «Incassato ✓ / Pagato ✓» in
  hover sulle righe non saldate. Scaduta = `due` con data passata (unico uso
  dell'arancio #c2410c).
- **Spese fisse** (`/finanza/spese-fisse`): totale al mese per gruppo, prossime
  scadenze a 60 giorni, elenco con prossima scadenza e ultimo pagamento,
  drawer, «Registra pagamento» → crea un `FinanceEntry` pagato e collegato
  (importo correggibile; doppione sulla stessa scadenza rifiutato).
- **Panoramica** (`/finanza?mese=YYYY-MM`, prima tab). Calcoli tutti in
  `lib/finance/finance-overview.ts` (puro, test `tests/unit/finance-overview.test.ts`):
  - **Margine del mese** = incassato − pagato del mese scelto (per `date`); il
    da incassare/previsto si mostra a parte, fuori dal margine. Confronto col
    mese prima solo se quel mese ha movimenti.
  - **MRR / ARR / ARPA**: stessa formula dei KPI (`planMonthlyCents`) sui
    `CompanyPlan` delle sole autoscuole clienti (`listFinanceCompanies`, quindi
    senza demo/test/consorziate). Sempre «oggi»: niente storico. I piani a
    pagamento senza `renewsAt` sono segnati «da completare» e restano fuori
    dalla previsione.
  - **Cassa** = saldo di partenza + movimenti saldati con `settledOn` dalla data
    di partenza a oggi. Senza saldo: stato vuoto + drawer «Imposta il saldo»
    (`saveFinanceOpeningBalance`). **Autonomia** = cassa ÷ spesa media dei mesi
    chiusi (fino a 3, solo dopo la partenza); senza mesi chiusi usa il totale
    delle spese fisse; senza nessuna delle due non si calcola.
  - **Grafico 12 mesi**: 6 mesi (il sesto è quello in corso) + 6 di previsione.
    Pieno = saldato; tratteggiato = previsto: movimenti non saldati, scadenze
    delle spese fisse non registrate, **rinnovi dei piani** (`renewsAt` +
    ogni mese/anno; canone dell'intero periodo, IVA inclusa). Un rinnovo non
    si conta se nello stesso mese c'è già un'entrata di quell'autoscuola. Le
    scadute finiscono nel mese in corso. Cassa sull'asse destro (tratteggiata
    nel futuro); i mesi prima della partenza restano vuoti, non a zero. Sul
    telefono il grafico scorre in orizzontale e si apre centrato sul mese in corso.
  - **In arrivo 90 giorni**: scadute in cima (arancio), poi per data.
  - **IVA da accantonare** del mese e del trimestre solare finora; segnala le
    spese senza aliquota (la loro IVA non si scala).
  - **Spese fisse** per gruppo (componente condiviso `RecurringSummary.tsx`).
    Comprende il fisso dei sales attivi (gruppo «Persone»), e così l'autonomia
    calcolata sulle spese fisse (`fixedMonthlyCents`).
  - **Vendite del mese** in fondo, come nel mockup: la stessa tabella della tab
    Vendite (`SalesMonthTable`), in sola lettura.
  - Fissi dei sales (giorno 1 di ogni mese) e commissioni da pagare (una voce
    per mese di firma, alla scadenza) entrano tra le uscite previste del
    grafico e in «in arrivo»; le commissioni oltre la scadenza sono scadute.
    Un fisso passato non pagato non diventa scaduto (come le spese fisse).
- **Autoscuole** (`/finanza/autoscuole?mese=YYYY-MM`): le autoscuole clienti
  (`listFinanceCompanies`, quindi senza demo/test/consorziate) con
  l'anagrafica commerciale (`CompanyCommercial`) e i numeri d'uso.
  - Stato attiva / in pausa / disdetta (data di disdetta obbligatoria). Senza
    riga `CompanyCommercial` lo stato è **«da completare»**: nessun default
    inventato. P.IVA normalizzata a 11 cifre, regione da elenco, sales da
    `SalesAgent`.
  - Piano letto da `CompanyPlan` (valore/anno IVA inclusa, rinnovo; piano a
    pagamento senza `renewsAt` = «da completare»). Si modifica col dialog
    esistente del backoffice (`BackofficeCompanyPlanDialog`), aperto dal drawer.
  - Numeri automatici con le regole dei KPI: istruttori che possono stare in
    agenda (attivi, con utente e ruolo istruttore), allievi iscritti (attivi =
    con una guida svolta nel mese), guide svolte (`isDoneStatus`) nel mese
    (mezzanotte di Roma) e in totale.
  - Barra dei totali in alto (tutte), riga dei totali in fondo (filtrate);
    le disdette non entrano nel valore dei piani. Filtri: stato, sales,
    piano, ricerca. Regole pure in `lib/finance/finance-schools.ts`.

- **Vendite** (`/finanza/vendite?mese=YYYY-MM`). Regole pure in
  `lib/finance/finance-sales.ts` (test `tests/unit/finance-sales.test.ts`).
  - Barra: contratti del mese, valore, commissioni maturate (con la scadenza),
    fissi, compenso.
  - **Riepilogo per sales**: contratti, valore, commissioni, fisso, compenso
    (= fisso + commissioni dei contratti firmati nel mese). Nei mesi chiusi il
    fisso conta solo se pagato davvero; nel mese in corso e nei futuri vale
    quello atteso. «Segna pagato» sul fisso → `paySalesFixed` crea il
    movimento (categoria «Stipendi e compensi», un solo fisso per sales e mese).
  - **Contratti del mese** e **commissioni ancora da pagare** degli altri mesi.
    Drawer contratto: valore precompilato dal piano dell'autoscuola (€/anno,
    IVA inclusa) e modificabile, % dal sales, importo ricalcolato ma
    modificabile. «Pagata il» → `saveSalesDeal` crea/aggiorna il movimento
    (categoria «Commissioni sales»); togliere la data lo cancella; cancellare
    il contratto cancella anche il pagamento.
  - Drawer sales: nome, email, fisso, %, attivo/archiviato. Si cancella solo
    senza contratti né pagamenti, altrimenti si archivia.
  - I movimenti nati da Vendite in Movimenti sono in sola lettura (si può solo
    eliminarli: una commissione eliminata torna «da pagare»).

## File

| File | Ruolo |
|---|---|
| `lib/finance/finance-math.ts` | Puro: scorporo IVA, ricorrenze, totali, parsing euro, mesi (test: `tests/unit/finance-math.test.ts`) |
| `lib/finance/finance-overview.ts` | Puro: margine, MRR, cassa/autonomia, IVA, grafico, in arrivo (test: `tests/unit/finance-overview.test.ts`) |
| `lib/finance/finance-sales.ts` | Puro: commissione e scadenza, riepilogo per sales, voci previste di fissi e commissioni (test: `tests/unit/finance-sales.test.ts`) |
| `lib/finance/finance-schools.ts` | Puro: P.IVA, stato «da completare», totali della tab Autoscuole (test: `tests/unit/finance-schools.test.ts`) |
| `lib/finance/finance-data.ts` | Letture (non "use server", senza guardia): autoscuole valide, categorie, movimenti, spese fisse, piani, impostazioni, anagrafica + numeri d'uso (`listFinanceSchools`), sales, contratti, fissi pagati |
| `lib/actions/finance.actions.ts` | Scritture con `requireGlobalAdmin` |
| `app/[locale]/backoffice/finanza/` | `layout.tsx` (titolo + tab), `page.tsx`, `movimenti/`, `spese-fisse/`, `autoscuole/`, `vendite/` |
| `components/pages/Backoffice/finance/` | `finance-ui.tsx` (primitivi dal mockup), `FinanceTabs`, `FinanceMovementsPage`, `FinanceEntrySheet`, `FinanceRecurringPage`, `RecurringExpenseSheets`, `FinanceOverviewPage`, `FinanceChart` (SVG a mano), `OpeningBalanceSheet`, `RecurringSummary`, `FinanceSchoolsPage`, `SchoolSheet`, `FinanceSalesPage`, `SalesSheets` (sales, contratto, fisso), `SalesMonthTable` |
