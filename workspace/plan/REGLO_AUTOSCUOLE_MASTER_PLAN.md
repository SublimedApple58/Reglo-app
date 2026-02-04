# Reglo Autoscuole — Master Plan (V1)

## Summary
Piano master per costruire il modulo **Reglo Autoscuole** con architettura coerente, scheduling engine base, interfacce role‑based e integrazioni (FIC + comunicazioni). Il piano è **decision‑complete** e allineato alle scelte concordate.

---

## 1) System Architecture (Core)

### 1.1 Intelligent Scheduling & Optimization Engine — V1
**Obiettivo:** gestire automaticamente slot istruttori/veicoli e reagire a cancellazioni o assenze.

**Decisioni V1:**
- Motore con **regole statiche** (no ottimizzazione avanzata)
- **Auto‑reschedule** in caso di cancellazione/assenza
- **Waitlist semplice** (notifica top 3 se si libera slot)

**Vincoli base (V1):**
- Orari lavoro
- Durata lezione + buffer fisso
- Disponibilità istruttori + veicoli

**Flussi chiave:**
- Creazione appuntamento → validazione disponibilità
- Assenza/allievo cancella → auto‑reschedule se possibile
- Se nessun slot → notifica staff + waitlist

---

## 1.3 Mobile + Availability Engine (estensione V1)
**Obiettivo:** saturare gli slot evitando ore vuote tramite disponibilità granulari e broadcast WhatsApp.

**Decisioni V1 (locked):**
- Mobile **React Native + Expo**, iOS‑first (effetti glass/blur)
- **Slot singoli** da 30 minuti
- **Broadcast WhatsApp** a lista (no push in V1)
- **Risorse libere** al reschedule (può cambiare istruttore/veicolo)

**Nuove entità (DB):**
- `AutoscuolaAvailabilitySlot` (ownerType: student/instructor/vehicle)
- `AutoscuolaBookingRequest`
- `AutoscuolaWaitlistOffer`
- `AutoscuolaWaitlistResponse`
- `AutoscuolaAppointment` → `slotId` opzionale

**Flussi chiave:**
- Inserimento disponibilità (allievo/istruttore/veicolo)
- Richiesta guida → matching engine su slot
- Cancella slot → broadcast WhatsApp (primo che accetta prende)
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

## 3) Communication & Notification Layer

### 3.1 Canali
- **Email + WhatsApp** (no Slack in V1)

### 3.2 Trigger automatici
- Appuntamento creato/aggiornato
- Appuntamento cancellato / no‑show
- Cambio stato pratica
- Scadenze imminenti

### 3.3 Flussi V1
- Conferma prenotazione
- Promemoria T‑7 / T‑1
- Alert scadenze (foglio rosa, visita medica)

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
