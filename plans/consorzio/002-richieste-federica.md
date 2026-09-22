# REG-507 — Richieste del Consorzio (Federica)

**Stato:** piano approvato da Tiziano il 2026-09-22, implementazione in corso sul
branch `tizianodifelice1/reg-507-richieste-consorzio` (da `origin/main`).

Richiesta arrivata da **Federica Fiorini**, `amministrazione@patenteprofessionale.it`.

---

## Chi ha chiesto, e perché conta

Federica è **OWNER dell'account Consorzio Autoscuole Riunite Car** — l'unico
account in modalità consorzio in produzione — non di una singola autoscuola
consorziata. Nel consorzio esistono **due** scuole di Pontedera (Easy Drive e
Gerardo): è questo che rende necessaria l'autoscuola di provenienza del punto 1.

**I 12 allievi del consorzio non hanno accesso all'app** (nessuno ha una
password: `count(*) FILTER (WHERE password IS NOT NULL) = 0`). Quindi tutti e
quattro i punti sono **web-only, account titolare**. Nessun lavoro mobile, e non
è un'assunzione: è un dato.

Le categorie CE/DE esistono solo in modalità consorzio, quindi ciò che le
riguarda non rischia di toccare le altre ~190 autoscuole.

---

## Punto 1 — Telefono e autoscuola di provenienza in agenda

**Deciso: fisso, nessun setting. Solo frontend web.**

Il dato **arriva già** all'agenda: `StudentOption` in `AutoscuoleAgendaPage`
contiene già `phone`, `consorzioSchoolId` e `consorzioSchoolName`. Non si tocca
né il backend né le query.

- **Telefono** → nel popover di dettaglio (click sul blocco), non sul blocco in
  griglia: in vista settimana il nome è già troncato a "Mario R.".
- **Autoscuola** → solo se `isConsortium` **e** più di una scuola. È la stessa
  condizione già usata da `SchoolFilterSelect` nei picker allievo: si riusa
  quella, così per un'autoscuola normale non cambia nulla.

Niente setting perché non c'è niente da decidere: dove serve si vede da sé, dove
non serve sparisce da sé.

## Punto 2 — Ordine COGNOME - NOME

**Deciso: configurabile in Impostazioni → Aspetto, spento di default. Riguarda
l'etichetta E l'ordinamento delle liste.**

### L'ostacolo, e perché il piano è in due tempi

Nel database **`User.name` è un unico campo di testo**. Non esistono
`firstName`/`lastName`. I form di creazione chiedono nome e cognome separati e li
concatenano; tutto il resto dell'app li ri-separa **spezzando sul primo spazio**
(`splitFullName` lato web, `cleanName.split(" ")` lato action).

Conseguenza: "Maria Grazia Rossi" viene letto come nome *Maria* e cognome
*Grazia Rossi*, e invertito darebbe **"Grazia Rossi Maria"**. Sui nomi composti
— comunissimi in Italia — l'euristica sbaglia.

- **(a) Fatto ora:** inversione di etichetta e ordinamento sulla separazione
  esistente. Corretta sui nomi semplici.

  > **Correzione del 23/09.** Il primo giro aveva applicato (a) solo alle
  > superfici con `firstName`/`lastName` separati, chiamandole "a dati puliti".
  > Era sbagliato: quei campi li produce `parseNameParts` spezzando `User.name`
  > sul primo spazio — **la stessa euristica**, solo eseguita prima lato server.
  > Non c'erano due famiglie di affidabilità diversa, e il QA l'ha dimostrato
  > subito trovando la tabella allievi del dettaglio autoscuola ancora in "Nome
  > Cognome". Ora l'ordine vale in **tutta la web app**, con un provider unico
  > (`StudentNameOrderProvider`) e un solo punto che indovina
  > (`splitStoredName`). Il debito (b) resta invariato: è lui la correzione vera.
- **(b) Debito tecnico, NON fatto:** campi `firstName`/`lastName` veri, con
  migrazione e backfill di ~1.200 utenti (stessi casi ambigui del backfill
  telefoni di REG-500) e modifica dei form di creazione. È la correzione vera.

Il setting spento di default protegge le altre autoscuole, abituate a NOME
COGNOME. Con 12 allievi di consorzio i nomi composti si controllano a occhio.

> ⚠️ **Il debito (b) va tenuto vivo.** Finché `User.name` resta un campo unico,
> qualunque funzione che distingua nome da cognome è un'euristica, non un dato.

### Dove e come

Sta in **Aspetto** perché è già la casa delle preferenze di visualizzazione
dell'agenda a livello di autoscuola (criterio colore, ordine colonne istruttore),
già normalizzata nel JSON `CompanyService.limits` e già specchiata sul mobile.

`nome + cognome` compare in una decina di punti nella sola agenda, più la vista
settimana che usa `nome + iniziale del cognome`. Non si toccano uno per uno: si
estrae **un helper condiviso** e ci passano tutti i siti, sullo schema di
`agenda-instructor-order.ts`.

## Punto 3 — Motrice invece del rimorchio (CE/DE)

**Deciso: è una CORREZIONE, non un'eccezione per Federica. Fissa, per tutti,
nessun setting.**

### Perché la regola attuale è sbagliata

Il rimorchio **non è un veicolo guidabile**: niente motore, niente posto di
guida, nessuna disponibilità propria, non si può prenotare da solo. Un camion
**è** un veicolo C e **diventa** un autotreno quando gli si aggancia un
rimorchio. Modellare CE come categoria intrinseca del veicolo descrive una
**configurazione temporanea come se fosse un'identità permanente**.

### La storia del codice — non fu una scelta, fu un'eredità

| Data | Commit | Cosa succede |
|---|---|---|
| 30/06/2026 | `87c133b` | Nasce l'idoneità veicolo↔patente. Il mondo è `B, AM, A1, A2, A`: gerarchia moto + "B è una classe a sé, combacia solo con B". **Per la B è corretto.** |
| 02/07/2026 | `6c83277` | `add BE/C/CE/D/DE categories (exact-match, no hierarchy)`. Le professionali vengono infilate **nel ramo già esistente della B**, ereditandone la regola. |

Il messaggio di commit dice *cosa* fa, mai *perché*. Nei commenti e nei doc la
regola è **affermata, mai argomentata**. E il commento nello schema Prisma
(riga 780) elenca **ancora oggi** solo `B | AM | A1 | A2 | A`: tre mesi dopo,
il modello dati descrive un mondo che non esiste più.

### La prova sui dati di produzione

10 allievi nelle categorie con rimorchio, su 3 autoscuole. Sui CE le due
autoscuole coinvolte si sono comportate nei due modi previsti dalla teoria:

| Autoscuola | Allievi CE | Veicoli CE | Veicoli C | Esito |
|---|---|---|---|---|
| Consorzio Autoscuole Riunite Car | 2 | **0** | 2 | **Bloccata**: nessun veicolo selezionabile |
| Autoscuola Macchiavello | 5 | 1 | 1 | **Ha aggirato**, marcando un camion come "CE" |

Macchiavello non dimostra che il sistema funziona: dimostra che per farlo
funzionare **ha dovuto etichettare male il proprio camion**.

### La correzione

Completare la gerarchia che **già esiste** (oggi solo AM < A1 < A2 < A) con le
catene del rimorchio:

**B < BE · C1 < C1E · C < CE · D1 < D1E · D < DE**

E, per la stessa ragione, le **qualificazioni sul mezzo su cui si svolgono**:
**CQC → C · ADR → C**. CQC e ADR non sono classi di veicolo ma abilitazioni che
si aggiungono a una patente: un corso CQC si fa su un camion. Il registro dei
colori dell'agenda lo diceva già (la CQC ha C come categoria madre). Deciso da
Tiziano il 22/09 dopo che il QA su staging ha mostrato 18 allievi CQC/ADR senza
un solo veicolo prenotabile.

Un allievo CE può usare un veicolo **C** (la motrice) o uno marcato **CE**. Senso
unico: un allievo **C non** può usare un veicolo CE, perché guidare un complesso
richiede la CE. Solo le motrici che hanno senso per quella categoria, mai "un
veicolo qualunque".

- **Rischio solo in allargamento**: nessuno perde un abbinamento che aveva oggi;
  il camion mal-etichettato di Macchiavello continua a funzionare (stessa
  categoria combacia sempre).
- **Un solo punto da toccare**: `vehicleServesLicense` / `licenseCategoryEligible`
  in `lib/autoscuole/license.ts`, documentato come *il chokepoint unico usato da
  matcher, disponibilità, scambi, gruppi moto e picker di prenotazione*.

**Fuori scope:** registrare *quale* rimorchio era agganciato. Oggi Reglo non lo
traccia e non deve iniziare adesso; se servisse, la tabella
`AutoscuolaAppointmentVehicle` esiste già.

## Punto 4 — Costo assenza configurabile

**Deciso: selettore Percentuale / Importo fisso nella sezione "Cancellazioni
tardive" che già esiste. Importo configurabile dall'autoscuola, mai cablato nel
codice. Vale sia per il no-show sia per l'annullamento tardivo.**

### Cosa c'è oggi, e cosa non c'è

Esistono **due** concetti di penale:

1. **Livello autoscuola** (`lib/autoscuole/payments.ts`): `penaltyPercent`
   (25/50/75/100% del prezzo guida) + `penaltyCutoffHours`. Questo è **davvero
   collegato**: addebito Stripe, coda tardive, pannello di risoluzione.
2. **Livello consorzio** (`limits.consorzioPricing`):
   `lateCancellationCutoffHours` e `lateCancellationPenaltyPct`, oggi 48 ore e
   100%. Sono salvate, modificabili nel pane Prezzi... e **non le legge nessun
   calcolo**. La fatturazione consorzio esclude e basta le guide annullate
   (`status: { not: "cancelled" }`).

Verificato: **tutti e 17 gli appuntamenti del consorzio hanno
`penaltyAmount = 0`** e nessuno ha `paymentRequired`.

> **Quindi oggi l'assenza di un allievo di consorzio costa esattamente 0 €**,
> mentre l'interfaccia dichiara 100%. Il lavoro non è "cambiare 100 in 20": è
> **far esistere la penale**. È la stessa patologia che ha aperto REG-500 — una
> schermata che promette qualcosa che non accade.

### Come si fa

Selettore **Percentuale / Importo fisso** nella sezione "Cancellazioni tardive"
(Impostazioni → Prenotazioni e allievi → Prezzi). Nessun concetto nuovo da
spiegare: è la stessa forma del segmented "A ore / Percorso" già presente su ogni
riga delle tariffe (REG-462), e come quello **tiene salvate entrambe le cifre**,
così cambiare criterio non perde l'altra.

Default suggerito 20 € per il consorzio, **modificabile**.

### Comunicazione a Federica

Nella risposta si parla **solo** del costo fisso configurabile. **Nessun
accenno** al fatto che oggi non viene addebitato nulla, né al divario fra i 20 €
richiesti e i 110 € che l'impostazione attuale dichiarerebbe. Decisione di
Tiziano.

---

## Nota di processo

Questa analisi nasce da una regola introdotta da Tiziano il 2026-09-22: **prima
di scrivere codice, per ogni punto di una richiesta si risponde a cinque
domande** — fisso o configurabile; se configurabile dove sta il setting; quale
tipo di account; quale piattaforma; cosa esiste già da riusare invece di creare
da zero.

Su quattro punti, quella griglia ha prodotto: un setting evitato (punto 1), un
debito tecnico scoperto prima di prometterlo risolto (punto 2), una richiesta
riqualificata da eccezione a bug (punto 3) e una funzionalità che si scopre non
essere mai esistita (punto 4). Vale la pena continuare ad applicarla.
