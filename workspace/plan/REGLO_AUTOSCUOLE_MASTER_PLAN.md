# Reglo Autoscuole — Master Plan (V1)

## Summary
Piano master per costruire il modulo **Reglo Autoscuole** con architettura coerente, scheduling engine base, interfacce role‑based e integrazioni (FIC + comunicazioni). Il piano è **decision‑complete** e allineato alle scelte concordate.

---

## 1) System Architecture (Core)

### 1.1 Intelligent Scheduling & Optimization Engine — V1 (aggiornato)
**Obiettivo:** eliminare tempi morti e mantenere gli slot **attaccati** tra loro; reagire a cancellazioni/assenze con riempimento automatico.

**Decisioni V1 (locked):**
- Motore con **regole statiche** (no ottimizzazione avanzata), ma con **heuristica anti‑buchi**
  - preferire slot che attaccano una guida precedente/successiva
- **Auto‑reschedule** in caso di cancellazione/assenza
- **Slot‑offer** (notifiche push/email) quando si libera uno slot
- UX proposta slot: **Accetta / Rifiuta** (no “proponimi altro”)

**Vincoli base (V1):**
- Orari lavoro
- Durata lezione + buffer fisso
- Disponibilità istruttori + veicoli + allievi

**Flussi chiave:**
- Creazione appuntamento → matching + scelta slot con priorità “anti‑buchi”
- Allievo cancella → crea **slot‑offer** + invio push/email a studenti compatibili
- Se nessuno accetta → slot resta open

---

## 1.3 Mobile + Availability Engine (estensione V1, aggiornato)
**Obiettivo:** saturare gli slot evitando ore vuote tramite disponibilità granulari e **slot‑offer** push/email.

**Decisioni V1 (locked):**
- Mobile **React Native + Expo**, iOS‑first (effetti glass/blur)
- **Slot singoli** da 30 minuti
- **Push + Email** per slot liberi (al posto del broadcast WhatsApp)
- **Risorse libere** al reschedule (può cambiare istruttore/veicolo)

**Nuove entità (DB):**
- `AutoscuolaAvailabilitySlot` (ownerType: student/instructor/vehicle)
- `AutoscuolaBookingRequest`
- `AutoscuolaWaitlistOffer`
- `AutoscuolaWaitlistResponse`
- `AutoscuolaAppointment` → `slotId` opzionale

**Flussi chiave:**
- Inserimento disponibilità (allievo/istruttore/veicolo)
- Richiesta guida → matching engine su slot (anti‑buchi)
- Cancella slot → **slot‑offer** + push/email (first‑come, first‑served)
- Nessuna risposta → slot resta open

**UX mobile per ruolo:**
- **Allievo:** disponibilità, richiesta guida, annulla, storico
- **Istruttore:** agenda, check‑in/no‑show/completed, disponibilità, veicoli
- **Titolare:** KPI, veicoli, disponibilità veicoli, override slot

### 1.2 Calendario Web (Demo + Operativo)
**Obiettivo:** vista unica e chiara degli slot con occupazione, istruttori e veicoli.

**Requisiti V1 (demo):**
- Calendario settimanale (slot time‑grid)
- Slot **occupati** con nome allievo + istruttore + veicolo
- Stato visibile (scheduled / completed / no‑show)
- Azione “cancella slot” → **auto‑reschedule immediato**
- Se non reschedulabile → evidenziare anomalia + notifica staff

**Output demo atteso:** calendario web con dati reali e una cancellazione che ri‑allinea il calendario.

---

### 1.2 Trigger‑Based Workflow (Checklist dinamiche)
- Stati pratica guidano le fasi successive
- Es. teoria superata → sblocca prenotazione guide
- Workflow gestiti da regole autoscuola + motore eventi

---

## 2) Role‑Based Minimal Interface

### 2.1 Instructor (Execution)
**V1 attivo:**
- Agenda giornaliera personale
- 1‑tap check‑in/out guida
- Segnalazione assenza
- Note su guida

### 2.2 Secretary (Exception Management)
**V1 attivo:**
- Dashboard anomalie (disdette, slot non riassegnati, ritardi pagamenti)
- Override manuale
- Blocco allievi per inadempienze
- Monitoraggio checklist

### 2.3 Owner (Profitability)
**KPI V1:**
- % saturazione slot istruttori
- Ore perse / non vendute
- Trend iscritti
- Cashflow (base)

### 2.4 Student (Self‑Service)
**V1:** nessuna UI (ruolo esiste ma senza accesso)

---

## 3) Communication & Notification Layer (aggiornato)

### 3.1 Canali
- **Email + Push** (no Slack in V1)

### 3.2 Trigger automatici
- Appuntamento creato/aggiornato
- Appuntamento cancellato / no‑show → **slot‑offer**
- Cambio stato pratica
- Scadenze imminenti
- **Reminder pre‑guida** (allievo/istruttore)

### 3.3 Flussi V1
- Conferma prenotazione
- **Reminder pre‑guida** configurabile (120/60/30/20/15 min)
- Alert scadenze (foglio rosa, visita medica)

### 3.4 Settings autoscuola (Web)
- Sezione Autoscuola → setting:
  - **Reminder allievo** (120/60/30/20/15 min)
  - **Reminder istruttore** (120/60/30/20/15 min)

---

## 4) Document & Compliance Pipeline

**V1 scope:**
- Checklist documenti per allievo
- Upload documenti
- Stato: missing / ok / expired
- Promemoria automatici su documenti mancanti

**Future (non V1):**
- Moduli precompilati
- Firma digitale

---

## 5) Financial & API Integration

**V1 scope:**
- Piano rateale
- Generazione fatture (Fatture in Cloud)
- Sollecito automatico per rate scadute

---

## 6) Data Model (DB)

### 6.1 Nuove entità
- **AutoscuolaInstructor**
- **AutoscuolaVehicle**
- **AutoscuolaAvailability**
- **AutoscuolaWaitlist**

### 6.2 Estensioni esistenti
- **AutoscuolaAppointment** → instructorId, vehicleId, duration, attendanceStatus
- **AutoscuolaCase** → dati scadenze + checklist status
- **AutoscuolaDocument** → required + documentType

### 6.3 Ruoli
- owner, secretary, instructor, student
- **ruolo singolo per utente**

---

## 7) Event & Workflow Integration

- Ogni update chiave genera eventi:
  - appointment.no_show
  - appointment.cancelled
  - case.status_changed
  - deadline.upcoming
- Workflows autoscuole agganciati agli eventi

---

## 8) QA & Test

### Test base
- Scheduling con auto‑reschedule
- Waitlist
- Trigger notifiche
- Pagamenti → sollecito

### QA manuale
- Creare istruttore + veicolo
- Creare appuntamento
- Simulare cancellazione → reschedule

---

## 9) Stato attuale
- ✅ Comunicazioni automatiche (email + WhatsApp)
- ✅ Scadenze + promemoria
- ⏳ Pagamenti + FIC
- ⏳ Documenti + checklist
- ⏳ KPI dashboard
- ⏳ Notifiche interne WhatsApp
- ⏳ WhatsApp automatiche allievi

---

## 10) Assunzioni (locked)
- Scheduling V1 = regole statiche
- Auto‑reschedule attivo
- Waitlist semplice
- Student UI non inclusa V1
- Slack escluso
- Pagamenti = rate + FIC
