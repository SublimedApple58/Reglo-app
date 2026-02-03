# Reglo Autoscuole — Features Plan (V1 senza SIDA)

## 0) Obiettivo
Sviluppare il **modulo Autoscuole** senza integrazione con SIDA, usando dati gestiti direttamente in Reglo (manuale + import CSV). Le feature sono in **ordine di importanza** come da input.

**Assunzioni chiave:**
- Reglo è modulare: Core (Doc Manager, Workflows, AI Assistant) + Modulo Autoscuole.
- Autoscuole richiede **Workflows + Doc Manager** (AI Assistant opzionale).
- V1 è **read/write solo in Reglo**; SIDA arriverà via Reglo Hub.

---

## 1) Fondazioni comuni (necessarie per tutte le feature)
### 1.1 Modello dati Autoscuole (minimo)
**Entità:**
- `Student` (allievo)
- `Case` (pratica + stato)
- `Appointment` (guida/esame)
- `Document` (upload + richieste)
- `PaymentPlan` + `PaymentInstallment`

**Campi chiave (minimi):**
- Student: nome, cognome, telefono, email, stato, note
- Case: categoria, stato, date rilevanti (esame, foglio rosa, scadenze)
- Appointment: tipo, data/ora, istruttore, stato

### 1.2 UI Autoscuole (pagine base)
- **Allievi** (lista + scheda)
- **Pratiche** (lista + stato)
- **Agenda** (guide/esami)
- **Documenti** (per allievo)
- **Pagamenti** (piani + scadenze)

### 1.3 Import CSV (baseline)
- Import iniziale Allievi/Pratiche/Appuntamenti
- Mapping colonne → campi Reglo

### 1.4 Centro Comunicazioni
- Template email/SMS/WhatsApp
- Log messaggi inviati
- Preferenze canali per allievo

---

## 2) Feature #1 — Comunicazioni automatiche con Allievi e Staff
**Valore:** riduce no‑show e lavoro manuale.

**Scope V1:**
- Template personalizzabili (email + SMS).
- Scheduling automatico (es. 7 giorni prima + reminder giorno prima).

**UI:**
- Template editor (oggetto, testo, variabili)
- Regole trigger (esame, guida, cambio stato pratica)

**Automazione:**
- Trigger da Appointment + Case status.
- Workflow standard “Promemoria” (pre‑configurato).

**Dipendenze:**
- Email: **Resend** (già in Reglo)
- SMS: **Twilio** (proposto per V1)

**Output:**
- invio automatico ai contatti definiti.

---

## 3) Feature #2 — Gestione scadenze e promemoria automatici
**Valore:** evita dimenticanze critiche (foglio rosa, visite, revisioni).

**Scope V1:**
- Scadenze per pratica/allievo (foglio rosa, visita medica)
- Alert automatici interni via email/WhatsApp allo staff

**UI:**
- Tab “Scadenze” con stato e priorità
- Regole comunicazioni dedicate alle scadenze (offset giorni)

**Automazione:**
- Trigger su date `Case.pinkSheetExpiresAt` / `Case.medicalExpiresAt`
- Scheduler minuti con deduplica per scadenza

**Dipendenze:**
- Email (Resend)
- WhatsApp (Twilio) opzionale

---

## 4) Feature #3 — Gestione e monitoraggio pagamenti (Fatture in Cloud)
**Valore:** riduce tempi admin, automatizza rate e solleciti.

**Scope V1:**
- Piano rateale
- Generazione fattura elettronica (FIC)
- Sollecito automatico se scaduta

**UI:**
- Scheda Pagamenti (piano rate, stato)
- CTA “Crea fattura”

**Automazione:**
- Trigger su `PaymentInstallment.dueDate`
- Workflow “Sollecito ritardo”

**Dipendenze:**
- **Fatture in Cloud** (già integrato)

---

## 5) Feature #4 — Gestione documenti e modulistica digitale
**Valore:** elimina carta, precompila moduli.

**Scope V1:**
- Archivio documenti per allievo
- Checklist documenti mancanti
- Moduli precompilati (Doc Manager)

**UI:**
- Tab Documenti nella scheda allievo
- Stato documenti (missing / ok)

**Automazione:**
- Workflow “Documenti mancanti”
- Invio promemoria automatico

**Dipendenze:**
- Doc Manager (core)

---

## 6) Feature #5 — Dashboard KPI e reportistica operativa
**Valore:** decisioni basate su dati reali.

**Scope V1:**
- KPI base: iscritti, tasso promossi, ore guida, rate in ritardo
- Trend ultimo mese

**UI:**
- Dashboard Autoscuole
- Grafici + cards

**Data sources:**
- Student + Case + Appointment + Payment

---

## 7) Feature #6 — Notifiche interne (WhatsApp)
**Nota:** sostituisce la vecchia Slack request.

**Scope V1:**
- Notifiche a gruppo/staff su WhatsApp (es. disdette)
- Template interni

**Dipendenze:**
- **WhatsApp Cloud API (Meta)**

---

## 8) Feature #7 — Comunicazioni WhatsApp automatiche con allievi
**Scope V1:**
- Inviare reminder ed eventi via WhatsApp
- Usare template pre-approvati (policy Meta)

**Dipendenze:**
- **WhatsApp Cloud API (Meta)**

---

## 9) Milestone consigliate (V1 senza SIDA)
1) **Core Autoscuole** (data model + UI base + CSV import)
2) **Comunicazioni automatiche** (email + SMS)
3) **Scadenze + promemoria**
4) **Pagamenti + FIC**
5) **Documenti + checklist**
6) **KPI dashboard**
7) **WhatsApp interno + WhatsApp allievi**

---

## Stato attuale
- ✅ **Feature #1 Comunicazioni automatiche con Allievi e Staff** (email + WhatsApp) — completata
- ✅ Feature #2 Scadenze + Promemoria — completata
- ⏳ Feature #3 Pagamenti + FIC — da fare
- ⏳ Feature #4 Documenti + Modulistica — da fare
- ⏳ Feature #5 KPI & Reportistica — da fare
- ⏳ Feature #6 Notifiche interne WhatsApp — da fare
- ⏳ Feature #7 WhatsApp automatiche allievi — da fare

---

## 10) Cosa serve da te (prima di sviluppare)
- Conferma provider SMS (Twilio ok?)
- Conferma WhatsApp provider (Meta Cloud ok?)
- Conferma struttura dati minima (Student/Case/Appointment)
- Conferma se l’import CSV deve essere immediatamente disponibile

---

## 11) Output finale V1 (senza SIDA)
- Reglo Autoscuole funzionante con dati manuali/CSV
- Comunicazioni automatiche attive
- Pagamenti e documenti gestibili
- KPI visibili e monitorabili
