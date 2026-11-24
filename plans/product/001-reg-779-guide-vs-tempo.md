# REG-779 — Guide o tempo di guida: analisi di prodotto

Stato: analisi approvata il 24/11/2026; si parte dai punti 1 (REG-780) e 2 (REG-781).

Solo analisi, nessuna riga di codice. Fonti:
- codice: `reglo` alla versione `31c86fa` e `reglo-mobile`;
- prod, in sola lettura il 24/11/2026: 26 autoscuole attive e le guide degli ultimi 90 giorni;
- schermata attuale: `oggi-crediti-e-prezzi.png`, presa su staging.

## Decisioni di Tiziano (24/11/2026)

1. **Via gli euro.** Al loro posto guide o ore da pagare. Stripe dichiarato dismesso.
2. **Posto di gruppo da pagare**: segue la modalità. Vale una guida se a guide, il suo tempo se a ore.
3. **«A ore» vuol dire a minuti.** I crediti a tempo sono in minuti, frazionabili liberamente (niente passi di mezz'ora).
4. **Passaggio libero da guide a ore**, quando l'autoscuola vuole. È il **titolare** a decidere come si convertono i saldi al momento del passaggio: non c'è una conversione fissa a 60 minuti.
5. **Ordine approvato**: si parte dai punti 1 e 2, in sequenza.

Task Linear, sotto REG-779:

| Punto | Task | Branch |
|---|---|---|
| 1 | REG-780 «Crediti e annullamenti» | `feat/reg-780-crediti-annullamenti` |
| 2 | REG-781 conteggio settimanale unico | — |

**Nota emersa preparando REG-780.** Oggi la cancellazione tardiva trattiene **la guida intera** oppure la condona, e decide il titolare, subito o dalla coda «Cancellazioni tardive». La percentuale entra solo nell'importo in euro. Tolti euro e Stripe, la percentuale non ha effetto: in REG-780 sparisce dalla pagina (il valore salvato resta) e torna, vera, al punto 5 con i crediti a tempo.

Dove questo piano dice «mezz'ora» o «×60», valgono le decisioni 3 e 4.

---

## Il punto di partenza, in numeri

Le guide svolte negli ultimi 90 giorni in prod sono circa 8.200, esami esclusi:

| Durata | Guide | Autoscuole |
|---|---|---|
| 60 min | 4.789 (58%) | 14 |
| 30 min | 1.299 | 7 |
| 120 min | 1.245 | 5 |
| 90 min | 362 | 9 |
| 45 min | 323 | 4 |
| 180 min | 120 | 2 |

**Il 42% delle guide non dura un'ora.** Oggi una guida da 120 minuti consuma lo stesso credito di una da 30, conta 1 nel limite settimanale e 1 nel blocco per debiti, e costa come una da 60. Il problema che pone Tiziano è reale e tocca 5–9 autoscuole su 14.

Impostazioni in prod (26 autoscuole attive):

| Impostazione | Autoscuole |
|---|---|
| Crediti guida accesi | 12 |
| Limite settimanale acceso | 10 |
| Blocco per debiti acceso | 6 |
| Stripe acceso | 0 |
| Prezzi cambiati rispetto a 25/50 € | 4 |
| Percentuale della penale cambiata | 12 |
| Preavviso cambiato | 8 |

Tutte le impostazioni dell'autoscuola stanno nel JSON `CompanyService.limits`. Aggiungere un'opzione lì **non richiede migrazioni**: servono solo default e validazione. Le migrazioni servono solo dove il dato vive in colonne intere che oggi contano guide: crediti e blocco per debiti.

---

## Mappa punto per punto

Per ogni punto:
1. oggi conta guide o tempo?
2. ha senso offrire l'altro criterio?
3. fisso o configurabile, e dove sta il setting?
4. chi lo vede e su quali piattaforme?
5. cosa c'è già da riusare?
6. che impatto ha su dati e migrazioni?

### A. Prenotazioni e allievi → Generali

**A1. Durata prenotazione allievo (`bookingSlotDurations`)**
1. Tempo: scelta tra 30, 45, 60, 90 e 120 minuti.
2. Non serve un altro criterio: è già la base del «tempo».
3. Configurabile per autoscuola e per gruppo di istruttori (cluster).
4. Titolare (web); allievo e istruttore (mobile: `booking-flow.tsx`, `BookingForm.tsx`, `ClusterSettingsScreen`).
5. È la fonte delle durate da riusare ovunque.
6. Nessuno.

**A2. Solo orari tondi, scambio guide, annullamento da app, prenotazioni di gruppo**
1. Né guide né tempo: sono interruttori.
2. Non serve l'altro criterio. Unica eccezione: lo scambio sposta 1 credito fra due allievi senza guardare la durata (vedi C1).
3. Nessuna azione.

### B. Prenotazioni e allievi → Limiti

**B1. Massimo di guide a settimana (`weeklyBookingLimit`)** — punto chiave
1. **Guide.** Conta gli appuntamenti non annullati dell'allievo da lunedì a domenica. Non filtra né per tipo né per durata: **contano anche esami, posti di gruppo e assenze**, e questo è un difetto a sé.
2. **Sì.** «Massimo 3 ore a settimana» è più giusto di «massimo 3 guide» quando le guide durano da 30 a 120 minuti. Lo chiedono soprattutto le scuole che usano durate diverse: 120 minuti in 5 scuole, 90 minuti in 9.
3. Oggi è configurabile per autoscuola e per cluster (`instructor-clusters.ts`), con esenzione per singolo allievo (`weeklyBookingLimitExempt`) e precedenza esami. Proposta: nuovo campo `weeklyBookingLimitUnit` = guide | ore, con `weeklyBookingLimit` interpretato come ore in modalità tempo (passi di mezz'ora).
4. Coinvolge tutti:
   - allievo in app: rifiuto della prenotazione, opzioni di prenotazione, etichetta morta in `AllievoHomeScreen:582`;
   - istruttore in app: conferma «supera il limite» in `BookingForm:614`;
   - titolare: web e `ClusterSettingsScreen`.
5. Da riusare:
   - la logica è **copiata in 4 posti**: `createBookingRequest`, `getBookingOptions`, `createAutoscuolaAppointment`, `respondSwapOffer`. Va prima raccolta in un'unica funzione, che conti guide o minuti;
   - per i minuti bastano `startsAt`/`endsAt`;
   - API: `weeklyBookingLimit.{limit,current,reached}` va esteso con `unit`.
6. Nessuna migrazione (JSON). Le guide senza `endsAt` vanno trattate con una durata di default unica: oggi il codice usa 30 in un posto e 60 in un altro.

**B2. Blocca chi ha troppe guide da pagare (`autoBookingBlockThreshold`)**
1. **Guide.** Conta 1 per ogni guida da pagare, contro una soglia (default 3).
2. **Sì, ma è meno urgente.** «3 guide da pagare» pesa diversamente se sono da 30 o da 120 minuti. Un'alternativa altrettanto sensata sarebbe una soglia in euro, ma dipende dal punto F.
3. Configurabile per autoscuola. Proposta: `autoBookingBlockUnit` = guide | ore.
4. Allievo in app (`PausedCard` con «N guide da pagare»), titolare e istruttore (web e mobile).
5. Da riusare: `isLessonUnpaid` / `unpaidLessonCandidatesWhere` (`lesson-unpaid.ts`). Il calcolo dei minuti si fa con le stesse query.
6. **Serve una migrazione leggera.** `CompanyMember.unpaidBlockClearedAtCount Int` memorizza un *numero di guide*. In modalità ore serve una colonna gemella in minuti, oppure va azzerato al cambio di unità. Anche il campo API `unpaidLessonCount` va accompagnato da `unpaidMinutes` e `unit`.

**B3. Stop last-minute, pausa tra le guide, riempi le fasce più vuote, precedenza esami**
1. Sono già a orario, minuti o giorni: non contano guide.
2. Non serve un altro criterio.
3. Nessuna azione.

### C. Crediti e prezzi

**C1. Crediti guida (`lessonCreditFlowEnabled`, `lessonCreditsRequired`)** — il punto che Tiziano cita per primo
1. **Guide.** Ogni movimento vale ±1, qualunque sia la durata:
   - la prenotazione consuma 1;
   - l'annullamento rende 1;
   - lo scambio sposta 1;
   - la cancellazione tardiva tiene o rende 1.

   Le ricariche sono solo manuali, dal titolare: non esistono pacchetti a pagamento.
2. **Sì.** È il caso più forte. Con i crediti accesi (12 scuole), chi vende «pacchetti da 10 ore» oggi non può rappresentarli: una guida da 120 minuti costa 1 credito come una da 30.
3. Proposta: impostazione dell'autoscuola «Un credito vale: **una guida** | **un'ora di guida**». In modalità ora la guida consuma `durata ÷ 60` crediti, frazionabili a mezz'ora.
4. Coinvolge tutti:
   - titolare: web, ricarica e storico;
   - allievo: saldo via `/api/mobile/payments/profile`. Il saldo non è mostrato in nessuna schermata mobile oggi, ma l'API c'è;
   - istruttore in app: testi come «il credito torna a…» in `cancel-fault.tsx` e `IstruttoreHomeScreen:1483`.
5. Da riusare:
   - registro dei movimenti (`AutoscuolaStudentLessonCreditLedger` con i motivi) e saldo (`…CreditBalance`);
   - `prepareAppointmentPaymentSnapshot` calcola già la durata (`computeDurationMinutes`);
   - il consorzio fattura già a minuti (`lib/consorzio/pricing.ts`): è il precedente da imitare.
6. **Serve una migrazione vera.**
   - `availableCredits Int` e `delta Int` oggi sono «guide». La proposta più semplice è salvare **sempre in minuti**, con l'unità che cambia solo la visualizzazione (1 guida = 60 minuti per chi resta a guide). È una conversione una tantum ×60 di saldi e storico: reversibile e senza perdita.
   - Sull'appuntamento, `creditApplied Boolean` diventa `creditMinutes Int`, così rimborsi e scambi rendono quanto è stato davvero preso.
   - Se cambia la durata di una guida già pagata a credito, il credito va ricalcolato. Oggi non succede nemmeno al prezzo.

**C2. Prezzi guida (`lessonPrice30`, `lessonPrice60`)** — vedi la sezione F
1. Ibrido. La fascia dipende dalla durata: da 45 minuti in su si usa il prezzo da 60, sotto il prezzo da 30. Ma una guida da 120 minuti costa come una da 60.
2. Se il prezzo resta, il modo giusto è a tempo: una tariffa oraria, come il consorzio. Proposta però: toglierlo (sezione F).

**C3. Cancellazioni tardive (`penaltyCutoffHoursPreset`, `penaltyPercentPreset`)**
1. Il preavviso è in ore. La penale è «X% del prezzo della guida» e produce un importo in euro (`penaltyAmount`) che viene addebitato solo con Stripe, **acceso da nessuna scuola**.
   - **Con i crediti, la percentuale non ha alcun effetto**: si perde un credito intero o niente. Eppure 12 scuole hanno cambiato quella percentuale.
   - Senza crediti, la guida finisce semplicemente «da pagare».
2. **Sì, in modalità tempo diventa vera.** «50%» di una guida da 60 minuti = 30 minuti di credito trattenuti. In modalità guide si può trattenere solo la guida intera, a meno di non ammettere mezzi crediti.
3. Configurabile per autoscuola (il consorzio ha regole proprie).
4. Titolare (web: coda «Cancellazioni tardive», `CancelAppointmentDialog` con «penale €X»); allievo in app (avviso «verrà comunque addebitata», «Penale €X» in `StudentPaymentsScreen:481`); istruttore.
5. Da riusare: `operational-cancellation.ts`, `resolveLateCancellation`, `penaltyCutoffAt` salvato su ogni guida.
6. Nessuna migrazione per la parte di impostazione. In modalità tempo sfrutta `creditMinutes` (C1).

### D. Ore obbligatorie e percorso patente

**D1. Ore obbligatorie (6 ore)**
1. **Tempo**, dal 06/11/2026: somma dei minuti delle guide svolte nel percorso attivo, arrotondata alla mezz'ora. La regola dei colori in agenda («le prime 6 guide da 60 minuti esatti») invece conta guide.
2. No: la legge parla di ore. Il criterio giusto c'è già.
3. Fisso (costante `REQUIRED_DRIVING_HOURS = 6`); deve restare fisso.
4. Titolare (web) e istruttore (mobile: `StudentNotesDetailScreen`, `InstructorNotesScreen`).
5. Pulizia:
   - l'API restituisce ancora `completedLessons` / `requiredLessons` a conteggio;
   - va verificato che il contatore mobile usi i minuti: un commento nel codice web dice di no;
   - va allineata la regola dei colori in agenda.
6. Nessuno.

**D2. Tipi di guida obbligatori (`lessonRequiredTypes`) e vincoli per tipo**
1. Presenza del tipo: basta una guida di quel tipo, non si conta niente.
2. **Forse in futuro**, come «almeno 1 ora di autostrada». Non è stato chiesto: lo lascerei fuori.

### E. Report, KPI, app

**E1. Ore guida (titolare web, `AutoscuoleOreGuidaPage`)**: già in minuti e ore, con export CSV. Va bene così.

**E2. Riepilogo del titolare (`getAutoscuolaOverview`), card «Oggi N guide» dell'istruttore, schermata istruttore del titolare in app**
1. Guide.
2. Sì come informazione in più: «4 guide · 5 h» accanto al numero. Nessun setting: è solo un dato da mostrare.

**E3. KPI del backoffice e degli investitori**
1. Guide svolte (conteggio); la saturazione è già in ore.
2. Non serve: sono metriche interne di Reglo. Il conteggio va bene, eventualmente con le ore accanto.

**E4. App allievo**
1. Il riquadro «Già fatte N guide» e «Questa settimana guidi N volte» contano guide, calcolate sul telefono.
2. Basta aggiungere le ore dove serve; i dati ci sono già (`startsAt`/`endsAt`).

**E5. Ore dell'istruttore in app (`InstructorHoursScreen`, `MonthHoursCard`)**: già in ore. Va bene.

### F. Job Trigger e API

- Nessun job conta guide contro un limite. `autoscuole-reminders` addebita penali e saldi solo via Stripe, cioè per nessuno oggi.
- Le API mobili da estendere (con `unit` e i minuti) sono tre:
  - le opzioni di prenotazione (`weeklyBookingLimit`);
  - lo stato di blocco (`unpaidLessonCount`);
  - il profilo pagamenti (saldo crediti).

---

## «Prezzi guida»: è usato?

**Sì, ma poco, e in modo fuorviante.** Il prezzo:
1. viene copiato su ogni prenotazione: `priceAmount`, e `penaltyAmount` = prezzo × %;
2. muove soldi veri **solo con Stripe**, che in prod non usa nessuno;
3. dà il prezzo fisso delle guide di gruppo (sempre quello da 60);
4. compare come importo in euro in tre punti:
   - debito degli ex allievi (web);
   - «penale €X» nel dialogo di annullamento;
   - «Penale €X» / «Addebitata €X» nell'app allievo.

**Non** è usato per crediti, ricariche, KPI, report, email o job (a parte Stripe). La frase in pagina «usato per i crediti» è **sbagliata**: i crediti ignorano il prezzo.

Toglierlo del tutto vuol dire anche:
- **smettere di mostrare importi in euro** nei tre punti sopra, e mostrare guide o ore da pagare;
- **lasciare Stripe senza importi**: va dichiarato dismesso. La pagina dice già che sta per uscire;
- **ripensare il prezzo delle guide di gruppo**, che oggi serve solo a quell'importo in euro.

Tolti questi, il prezzo non regge più niente di vivo. Le 4 scuole con prezzi propri vedrebbero sparire due campi che oggi non cambiano nulla di concreto.

### Com'è oggi

Schermata: `/tmp/hiro-anteprime/reg-779/oggi-crediti-e-prezzi.png` (non salvata nel repo).

- **Crediti guida** [interruttore]. «Le guide si pagano con crediti caricati dall'autoscuola: annullamenti tardivi e guide senza credito risultano da pagare.»
- **Prezzi guida**. «Valore di una guida: usato per i crediti e per il calcolo della penale.»
  - Guida da 30 minuti [25 €]
  - Guida da 60 minuti [50 €]
- **Cancellazioni tardive**. «Se l'allievo annulla oltre il cutoff, sulla guida viene applicata la penale.»
  - Cutoff annullamento [24 ore prima della guida ▾]
  - Penale [50% del prezzo della guida ▾]

Problemi:
- il prezzo sembra decisivo e non lo è;
- «cutoff» è gergo;
- la percentuale promette una cosa che con i crediti non succede;
- mancano 90 e 120 minuti.

### Come la ripenserei (solo testo)

Il titolo della sotto-scheda diventa **«Crediti e annullamenti»**.

1. **Crediti guida** [interruttore], com'è oggi.
   - Sotto, solo se acceso: **Un credito vale** [Una guida | Un'ora di guida] (punto C1).
   - Testo: «Le guide si pagano con i crediti che carichi all'allievo. Senza credito, la guida resta da pagare.»
2. **Annullamenti all'ultimo momento**
   - **Preavviso minimo** [24 ore ▾]. «Chi annulla con meno preavviso paga comunque una parte della guida.»
   - **Quanto paga chi annulla tardi** [Metà guida ▾], con le opzioni Un quarto, Metà, Tre quarti, Tutta la guida.
   - Testo sotto, che cambia con la modalità:
     - a ore: «Gli vengono trattenuti 30 minuti di credito su una guida da un'ora.»
     - a guide: «Con i crediti a guida si trattiene la guida intera; senza crediti, la guida resta da pagare.» In questo caso le opzioni parziali non compaiono e resta «Tutta la guida / decidi tu ogni volta» (la coda di oggi).
3. **Niente «Prezzi guida».** Nessun euro in questa pagina.

---

## Proposta: cosa fare e in che ordine

Stime a punti (0/1/2/3/5); sopra 5 il punto è già spaccato.

| # | Cosa | Piattaforme | Stima |
|---|---|---|---|
| 1 | **Pulizia «Crediti e prezzi»**: via «Prezzi guida», testi chiari su preavviso e penale, importi in euro sostituiti da guide/ore da pagare (debiti ex allievi, dialogo di annullamento, app allievo). Stripe dichiarato dismesso. | web + backend + mobile (testi) | 3 |
| 2 | **Conteggio settimanale unico**: le 4 copie in una funzione, solo guide di guida (fuori esami e posti di gruppo). Prepara il punto 3 e corregge un difetto di oggi. | backend | 2 |
| 3 | **Limite settimanale a guide o a ore**: impostazione per autoscuola e cluster, API con `unit`, testi. | web + backend | 3 |
| 3b | Stesso punto lato app: `BookingForm`, `ClusterSettingsScreen`, messaggi allievo. | mobile (OTA) | 2 |
| 4a | **Crediti a tempo, backend**: registro e saldo in minuti (migrazione ×60), `creditMinutes` sull'appuntamento, consumo, rimborso, scambio, cancellazione tardiva, ricalcolo al cambio di durata. | backend + migrazione | 5 |
| 4b | Crediti a tempo, web: «Un credito vale», ricarica in ore, storico, saldo. | web | 3 |
| 4c | Crediti a tempo, app: saldo e testi «credito» per istruttore e allievo. | mobile (OTA) | 2 |
| 5 | **Penale in percentuale vera** sui crediti a tempo, con la coda delle cancellazioni tardive. | backend + web | 2 |
| 6 | **Blocco per debiti a guide o a ore** (colonna gemella di `unpaidBlockClearedAtCount`). | backend + web + mobile | 3 |
| 7 | Pulizia delle ore obbligatorie: contatore mobile a minuti, campi API a conteggio, regola dei colori in agenda. | backend + mobile | 1 |
| 8 | Ore accanto al numero di guide in riepilogo, card «Oggi» e app allievo. | web + mobile | 2 |

**Ordine consigliato:**
- prima **1** (vittoria rapida: toglie una promessa falsa) e **2** (corregge un difetto e prepara il resto);
- poi **3 + 3b**: il limite settimanale è il caso più chiesto e non richiede migrazioni;
- poi **4a → 4b → 4c → 5**, il blocco grosso;
- infine **6**, **7** e **8** se avanzano.

Totale ≈ 28 punti; il cuore (1–5) ≈ 22.

**Domande per Tiziano prima di partire:**
- Togliamo davvero gli euro? Il debito degli ex allievi e «Penale €» in app diventerebbero ore o guide da pagare.
- Guide di gruppo: senza prezzo, un posto di gruppo «da pagare» vale una guida, oppure le sue ore?
- In modalità ore, i crediti si possono frazionare alla mezz'ora? (Proposta: sì.)
- Passare da guide a ore e viceversa è ammesso in qualunque momento, con i saldi convertiti a 60 minuti per guida? (Proposta: sì, con un avviso di conferma.)
