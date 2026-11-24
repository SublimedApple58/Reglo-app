# REG-783 (REG-779 punti 4a + 4b + 4c): crediti guida a guide o a minuti

## Cosa è stato fatto
- Migrazione additiva `20261124120000_lesson_credit_minutes`: `unit` su saldi e movimenti, `creditAmount`/`creditUnit` sulle guide, tabella `AutoscuolaCreditUnitSwitch`. Niente backfill: una guida con le colonne vuote vale 1 guida.
- Backend: costo per unità, rimborso con le regole di Tiziano, scambio, condono e «Addebita», cambio di durata, passaggio di unità transazionale con anteprima e impronta dei saldi.
- Web (4b): «Un credito vale», dialogo di passaggio, crediti in ore nella scheda allievo con ricarica in ore e minuti e storico.
- App (4c): vedi la sezione in fondo.
- Rispetto al piano iniziale: niente saldo per unità (la regola definitiva rende sempre nell'unità di adesso) e niente script di backfill.

---

# REG-779 punto 4a — crediti in minuti: piano della migrazione

Solo piano: il DB non è stato toccato. I numeri vengono da letture in sola
lettura su prod del 24/11/2026.

## Da dove si parte (prod)

| Cosa | Quanti |
|---|---|
| Saldi crediti (`AutoscuolaStudentLessonCreditBalance`) | 1.270, di cui 33 diversi da zero e nessuno negativo |
| Movimenti (`AutoscuolaStudentLessonCreditLedger`) | 533, in 6 autoscuole |
| Guide pagate a credito (`creditApplied = true`) | 310, di cui 20 future |

Oggi ogni movimento vale ±1 «guida». `availableCredits` e `delta` sono `Int`
senza unità. La guida ricorda solo un booleano (`creditApplied`), non quanto ha
consumato.

## Decisioni di Tiziano

- I crediti a tempo sono in **minuti**, frazionabili liberamente.
- L'autoscuola può passare da guide a minuti, e viceversa, quando vuole.
- Al passaggio è il **titolare** a decidere come si convertono i saldi: non c'è un fisso a 60.

## Schema: solo aggiunte, nessun valore esistente cambia

1. **`AutoscuolaStudentLessonCreditBalance.unit`**: `String @default("lessons")`.
   Dice in che unità è `availableCredits`. Tutte le righe esistenti restano
   «lessons» col loro numero.
2. **`AutoscuolaStudentLessonCreditLedger.unit`**: `String @default("lessons")`.
   Ogni movimento dice in che unità è il suo `delta`. Si aggiunge il motivo
   nuovo `unit_conversion`.
3. **`AutoscuolaAppointment.creditAmount Int?` e `creditUnit String?`**: quanto
   ha consumato davvero la guida, e in che unità. Rimborsi, scambi e
   cancellazioni tardive restituiscono questo valore, non più «1».
4. **Tabella nuova `AutoscuolaCreditUnitSwitch`**: `id`, `companyId`,
   `fromUnit`, `toUnit`, `minutesPerLesson Int`, `remainderPolicy String?`
   (`floor` | `ceil` | `round`, solo da minuti a guide), `actorUserId`,
   `createdAt`.
   È la traccia di ogni passaggio. Serve per rimborsare in modo giusto una guida
   pagata prima del passaggio e annullata dopo.
5. **Impostazione dell'autoscuola** `lessonCreditUnit`: `"lessons"` |
   `"minutes"` in `CompanyService.limits`, JSON quindi senza migrazione.
   Default «lessons».

Tutto è additivo, con default o nullable. Il codice di oggi ignora le colonne
nuove, quindi la migrazione si può applicare prima del codice.

## Backfill (script a parte, idempotente, prima su staging)

- Le guide con `creditApplied = true` e `creditRefundedAt IS NULL` (circa 310
  in prod) ricevono `creditAmount = 1` e `creditUnit = 'lessons'`.
- Non tocca saldi e movimenti: il default «lessons» è già corretto.
- Lo script dice in anticipo quante righe cambierebbe (prova a vuoto), e scrive
  solo con `--apply`.

## Il passaggio di unità (prodotto, punti 4a e 4b)

Il titolare passa da «guide» a «ore». Un dialogo chiede **«1 guida vale
[60] minuti»**: il numero lo sceglie il titolare. Poi, in una transazione:

- per ogni saldo dell'autoscuola, `nuovo = vecchio × minuti`, con un movimento
  `unit_conversion` (delta = differenza, `unit = 'minutes'`) e `balance.unit = 'minutes'`;
- una riga in `AutoscuolaCreditUnitSwitch`, con `minutesPerLesson` e `remainderPolicy`;
- `lessonCreditUnit = 'minutes'`.

Il passaggio inverso, da minuti a guide, divide per i minuti scelti.
**L'arrotondamento non è fisso (risposta di Tiziano, 24/11)**: se una divisione
lascia un resto, al passaggio si chiede al titolare come gestirlo, nello stesso
dialogo della conversione dei saldi. Per esempio:

- «Gli allievi con un resto: arrotonda per difetto / per eccesso / al più vicino»;
- per ogni allievo coinvolto, l'anteprima mostra saldo prima → dopo e il resto.

La scelta finisce in `AutoscuolaCreditUnitSwitch.remainderPolicy`, una colonna
in più rispetto alla prima versione del piano. Ogni movimento
`unit_conversion` registra il resto trattato.

**Si può cambiare unità anche con guide già pagate in agenda** (risposta di
Tiziano, 24/11): in prod oggi sono 20. Quelle guide tengono
`creditAmount`/`creditUnit` della loro unità, quindi il dato per decidere c'è.

**Guida pagata prima del passaggio e annullata dopo (regola definitiva di
Tiziano, 24/11, sostituisce le precedenti):** se una guida pagata a credito
**prima** del passaggio da guide a minuti viene annullata in tempo **dopo** il
passaggio, all'allievo torna **la durata della guida in minuti** (guida da 90
minuti → 90 minuti di credito). Non torna la guida convertita col valore scelto
al passaggio, e non torna zero.

- Il rimborso va sempre nell'unità corrente dell'autoscuola, quindi l'allievo
  non ha mai un saldo misto: lo schema resta un saldo per allievo, come oggi.
- Per riconoscere il caso: la guida ha `creditUnit = 'lessons'`, l'autoscuola ora
  è in minuti. La durata è `endsAt - startsAt` della guida al momento dell'annullamento.
- Cancellazione tardiva, condono, scambio e gli altri casi a cavallo del
  passaggio sono in `/tmp/hiro-anteprime/reg-783/casi-limite.md`: le decisioni
  le prende Tiziano.
- **Verso opposto (da minuti a guide):** una guida pagata in minuti e annullata
  in tempo dopo il ritorno alle guide fa tornare 1 guida (Tiziano, 24/11).
- **Durata cambiata dopo il pagamento:** al rimborso conta la durata al momento
  dell'annullamento (Tiziano, 24/11).

## Ordine di rilascio

1. Branch e worktree dedicati: migrazione e script di backfill.
2. Staging: `pnpm migrate:staging`, backfill in prova a vuoto, poi `--apply`, verifica con query.
3. Codice 4a (consumo, rimborso, scambio, cancellazione tardiva in minuti) su staging, con test.
4. Prod **solo con ok**: `pnpm migrate:prod`, poi backfill, poi merge del codice. Nessun job Trigger da ridistribuire: i job non toccano i crediti.
5. Come si torna indietro: il codice vecchio ignora le colonne nuove. Se serve, una migrazione di rimozione le toglie. Finché nessuna autoscuola passa a minuti, nessun dato cambia significato.

## Risposte di Tiziano (24/11/2026)

- **a) Resto passando da minuti a guide:** non lo decidiamo noi. Lo sceglie il titolare al passaggio, nello stesso dialogo della conversione dei saldi (vedi sopra).
- **b) Cambio unità con guide già pagate in agenda:** si deve poter fare. Se poi una, pagata a guide, viene annullata in tempo dopo il passaggio a minuti, torna la sua durata in minuti (regola definitiva).
- **c) Ricariche manuali a tempo:** in **ore e minuti** («5 ore e 30»), come il limite settimanale (`parseHoursInput`). Si salvano in minuti.

Stato: via di Tiziano il 24/11 (REG-783). Prima le anteprime del titolare (4a + 4b), poi il codice. Migrazione additiva solo sul DB dev, mai `migrate reset`; prod solo col via.

---

# REG-783: casi limite del passaggio di unità e dei crediti a minuti

Per ogni caso: cosa succederebbe col piano attuale e la mia proposta. **Decide Tiziano.**

Punto fermo, deciso da Tiziano il 24/11: una guida pagata a guide prima del passaggio a minuti e annullata in tempo dopo il passaggio fa tornare **la sua durata in minuti**.

Come funziona oggi il codice: ogni movimento vale ±1. Il saldo non scende mai sotto zero (in prod nessun saldo è negativo). La guida ricorda solo «pagata a credito sì/no».

---

## Annullamenti

**1. Annullata tardi (dopo il preavviso), pagata prima del passaggio.**
- **Oggi col piano:** il credito non torna, come per ogni annullamento tardivo.
- **Proposta:** uguale, non torna niente.

**2. Annullamento tardivo condonato dopo il passaggio («Restituisci il credito» in Cancellazioni tardive).**
- **Oggi col piano:** il codice rende «+1».
- **Proposta:** come il punto fermo, torna la durata in minuti. Un condono vale come un annullamento in tempo.

**3. Annullata dall'autoscuola o dall'istruttore dopo il passaggio.**
- **Oggi:** torna sempre, anche oltre il preavviso.
- **Proposta:** torna la durata in minuti, come il punto fermo.

**4. Condono revocato («Addebita» dopo un «Restituisci»).**
- **Oggi:** riscala 1.
- **Proposta:** riscala esattamente quanto era stato reso (lo si legge dal movimento del rimborso).

**5. Allievo assente (no-show).**
- **Oggi:** niente rimborso.
- **Proposta:** invariato, il passaggio non cambia niente.

**6. Guida passata tolta dallo storico con «restituisci il credito», dopo il passaggio.**
- **Oggi:** rende «+1».
- **Proposta:** come il punto fermo, la durata in minuti.

## Verso opposto: da minuti a guide

**7. Guida pagata in minuti, annullata in tempo dopo il ritorno alle guide.**
- **Oggi col piano:** non è deciso.
- **Proposta:** torna 1 guida, a prescindere dalla durata. È lo specchio del punto fermo: si rende la guida nella moneta di adesso. In alternativa si converte la durata con lo stesso valore e lo stesso arrotondamento scelti al passaggio. **Da decidere.**

**8. Passaggio avanti e indietro (guide → minuti → guide) con la stessa guida in agenda, poi annullata.**
- **Oggi col piano:** non è deciso.
- **Proposta:** conta solo l'unità di adesso. Se oggi l'autoscuola è a guide torna 1 guida, se è a minuti torna la durata. Così non servono catene di conversioni.

## Scambio guida tra allievi (REG swap)

**9. Scambio a cavallo del passaggio.** A aveva pagato a guide prima del passaggio, B prende la guida dopo.
- **Oggi:** A +1, B −1.
- **Proposta:** A riceve la durata in minuti (stessa regola di un annullamento in tempo), B paga la durata in minuti. La guida passa a `creditUnit = minutes`.

**10. Chi prende la guida non ha abbastanza minuti** (per esempio ha 60 minuti, la guida dura 90).
- **Oggi:** lo scambio passa e il saldo si ferma a zero, quindi lo scarto si perde.
- **Proposta:** se servono crediti per prenotare, lo scambio non si accetta finché non c'è il saldo. Altrimenti la guida resta «da pagare».

## Durata e minuti

**11. Cambio di durata di una guida già pagata, in minuti** (da 60 a 90).
- **Oggi:** nessun ricalcolo.
- **Proposta:**
  - se la guida si allunga, si scalano i minuti in più;
  - se si accorcia, si rendono i minuti di meno;
  - se il saldo non basta, la differenza resta «da pagare», mai saldo negativo.

**12. Cambio di durata di una guida pagata a guide prima del passaggio.**
- **Oggi:** niente.
- **Proposta:** non si tocca: la guida era stata pagata «una guida», qualunque fosse la durata. Se poi viene annullata in tempo, torna la durata nuova, quella che ha al momento dell'annullamento. **Da confermare**, perché in alternativa si può usare la durata al momento del pagamento.

**13. Prenotazione con minuti che non bastano** (60 minuti di saldo, guida da 90).
- **Oggi:** non si applica (si conta 1).
- **Proposta:**
  - se servono crediti per prenotare, la prenotazione non passa (l'app dice «Ti servono 30 minuti in più»);
  - se non servono, la guida resta tutta «da pagare»;
  - niente pagamento parziale.

**14. Guida da 45 minuti, o con durate strane.**
- **Oggi:** non si applica.
- **Proposta:** si scalano i minuti esatti. Il passaggio da minuti a guide usa il resto scelto dal titolare.

**15. Esami.**
- **Oggi:** non consumano crediti.
- **Proposta:** invariato.

## Guide di gruppo

**16. Posto in guida di gruppo coperto con credito prima del passaggio, annullato in tempo dopo.**
- **Oggi:** il posto si copre con «Copri con credito» (+1/−1).
- **Proposta:** come il punto fermo, torna la durata del gruppo in minuti.

**17. «Copri con credito» di un posto in gruppo dopo il passaggio.**
- **Oggi:** −1.
- **Proposta:** scala la durata del gruppo in minuti. Se non bastano, il bottone non c'è (oggi compare solo con saldo > 0) e il posto resta da pagare.

## Il passaggio stesso

**18. Saldo negativo al passaggio.**
- **Oggi:** in prod non esistono saldi negativi (il codice li blocca a zero).
- **Proposta:** se un saldo è negativo, si converte con la stessa regola, arrotondando a sfavore dell'allievo solo se il titolare l'ha scelto. Nel dialogo il saldo negativo si vede in elenco, come gli altri.

**19. Ricarica, prenotazione o annullamento mentre il titolare sta passando di unità.**
- **Oggi col piano:** il passaggio è una transazione unica.
- **Proposta:**
  - il passaggio blocca i saldi dell'autoscuola mentre converte;
  - ogni operazione arrivata un attimo prima viene convertita, quella arrivata dopo vede l'unità nuova;
  - l'anteprima del dialogo può essere vecchia di qualche secondo, quindi al momento di «Passa» si ricalcola tutto: se i numeri sono cambiati, il dialogo si aggiorna e chiede di nuovo conferma.

**20. Ricarica scritta in ore e salvata dopo il ritorno a guide** (form aperto da prima).
- **Oggi:** non si applica.
- **Proposta:** il server rifiuta la ricarica se l'unità del form non è quella di adesso, con il messaggio «L'autoscuola è passata alle guide: ricarica di nuovo».

**21. Due titolari che passano di unità insieme.**
- **Proposta:** vince il primo. Il secondo riceve «Già passati alle ore» e nessuna doppia conversione (il passaggio controlla l'unità di partenza dentro la transazione).

**22. Passaggio con crediti disattivati.**
- **Proposta:** si può cambiare l'unità anche a crediti spenti. Se non ci sono saldi, niente dialogo di conversione: si cambia e basta.

**23. Override per gruppo di istruttori.**
- **Proposta:** l'unità dei crediti è solo dell'autoscuola, non si sovrascrive per gruppo di istruttori. Un saldo è unico per allievo.

## App (4c) e testi

**24. App vecchia (OTA non ancora presa) con l'autoscuola a minuti.**
- **Oggi:** l'app mostra «N crediti».
- **Proposta:** l'API manda anche `unit` e un testo già pronto («5 ore e 30»), e le app vecchie leggono quel testo. Si rilascia prima 4c, poi si abilita il passaggio.

**25. Notifiche e messaggi automatici che dicono «1 credito».**
- **Proposta:** il testo si sceglie in base all'unità: «90 minuti di credito restituiti».

---

## Decisioni di Tiziano (24/11/2026)

- Design approvato, tutte le schermate.
- **Caso 7:** torna 1 guida.
- **Caso 12:** torna la durata nuova, quella al momento dell'annullamento.
- **Caso 24:** web e app (4c) escono insieme, con l'OTA; il passaggio non viene bloccato. L'API manda anche il saldo già scritto in parole, così un'app vecchia non mostra «90 crediti».
- Tutte le altre proposte approvate così come sono scritte.
