# Reglo Autoscuole — Features Plan (V1)

## 0) Obiettivo
Sviluppare il **modulo Autoscuole** in V1 senza integrazione SIDA, allineato al Master Plan.

**Assunzioni chiave (locked):**
- Scheduling V1 a **regole statiche** con **auto‑reschedule**
- **Waitlist semplice**
- **Ruolo singolo per utente**
- **Student UI assente** in V1
- **No Slack** (Email + WhatsApp)
- Pagamenti = **rate + Fatture in Cloud**

---

## 1) Fondazioni comuni (necessarie per tutte le feature)
### 1.1 Modello dati Autoscuole (minimo)
**Entità core:**
- `Student` (allievo)
- `Case` (pratica + stato)
- `Appointment` (guida/esame)
- `Document` (upload + richieste)
- `PaymentPlan` + `PaymentInstallment`

**Entità scheduling:**
- `Instructor`
- `Vehicle`
- `Availability`
- `Waitlist`

**Campi chiave (minimi):**
- Student: nome, cognome, telefono, email, stato, note
- Case: categoria, stato, **scadenze** (foglio rosa, visita medica)
- Appointment: tipo, data/ora, istruttore, veicolo, stato

### 1.2 UI Autoscuole (pagine base)
- **Dashboard** (Owner)
- **Allievi**
- **Pratiche**
- **Agenda**
- **Scadenze**
- **Documenti**
- **Pagamenti**
- **Comunicazioni**

### 1.3 Import CSV (baseline)
- Import iniziale Allievi/Pratiche/Appuntamenti
- Mapping colonne → campi Reglo

### 1.4 Centro Comunicazioni
- Regole + messaggi in un unico blocco (no template separati)
- Variabili dinamiche (TokenInput)
- Log messaggi inviati

---

## 2) Feature #1 — Comunicazioni automatiche con Allievi e Staff
**Valore:** riduce no‑show e lavoro manuale.

**Scope V1:**
- Regole personalizzabili (Email + WhatsApp)
- Scheduling automatico (T‑7, T‑1)
- Messaggi dinamici

**Automazione:**
- Trigger da Appointment + Case status

**Dipendenze:**
- Email: Resend
- WhatsApp: Twilio (sandbox accettato)

**Stato:** ✅ completata

---

## 3) Feature #2 — Gestione scadenze e promemoria automatici
**Valore:** evita dimenticanze critiche (foglio rosa, visite).

**Scope V1:**
- Scadenze per pratica/allievo
- Alert automatici staff via Email/WhatsApp

**UI:**
- Pagina “Scadenze” con stato e priorità
- Regole dedicate per scadenze

**Automazione:**
- Trigger su `Case.pinkSheetExpiresAt` / `Case.medicalExpiresAt`

**Stato:** ✅ completata

---

## 4) Feature #3 — Gestione e monitoraggio pagamenti (Fatture in Cloud)
**Valore:** riduce tempi admin, automatizza rate e solleciti.

**Scope V1:**
- Piano rateale
- Generazione fattura elettronica (FIC)
- Sollecito automatico per rate scadute

**UI:**
- Scheda Pagamenti (piano rate, stato)
- CTA “Crea fattura”

**Automazione:**
- Trigger su `PaymentInstallment.dueDate`

---

## 5) Feature #4 — Gestione documenti e modulistica digitale
**Valore:** elimina carta, precompila moduli.

**Scope V1:**
- Checklist documenti
- Upload documenti
- Stato: missing / ok / expired

**Automazione:**
- Promemoria automatici su documenti mancanti

---

## 6) Feature #5 — Dashboard KPI e reportistica operativa
**Valore:** decisioni basate su dati reali.

**Scope V1:**
- KPI base (saturazione, ore perse, trend iscritti, cashflow)

---

## 7) Feature #6 — Notifiche interne (WhatsApp)
**Scope V1:**
- Notifiche a gruppo/staff su WhatsApp

---

## 8) Feature #7 — Comunicazioni WhatsApp automatiche con allievi
**Scope V1:**
- Messaggi WhatsApp automatici agli allievi

---

## 9) Milestone consigliate (V1)
1) Core Autoscuole (data model + UI base + CSV)
2) Comunicazioni automatiche
3) Scadenze + promemoria
4) Pagamenti + FIC
5) Documenti + checklist
6) KPI dashboard
7) WhatsApp interno + WhatsApp allievi
8) Mobile app + Availability Engine

---

## Stato attuale
- ✅ Feature #1 Comunicazioni automatiche — completata
- ✅ Feature #2 Scadenze + Promemoria — completata
- ⏳ Feature #3 Pagamenti + FIC — da fare
- ⏳ Feature #4 Documenti + Checklist — da fare
- ⏳ Feature #5 KPI — da fare
- ⏳ Feature #6 WhatsApp interno — da fare
- ⏳ Feature #7 WhatsApp allievi — da fare
- ⏳ Feature #8 Mobile + Availability Engine — da fare

---

## Output finale V1
- Autoscuole operativa per segreteria/istruttori
- Scheduling base con auto‑reschedule
- Comunicazioni e scadenze automatizzate
- Pagamenti e documenti gestibili
- KPI base per Owner
