# Product Improvements Plan — Reglo (Focus: Studi Professionali)

## Intento
Aumentare vendibilità e valore percepito di Reglo per studi professionali con un prodotto **out‑of‑the‑box**, workflow affidabili e onboarding assistito. Nessuna timeline rigida: fasi indipendenti e parallelizzabili.

---

## 0) Decisioni aperte (da chiudere prima di sviluppo esteso)
- **Firma digitale**: scegliere provider EU/eIDAS (opzioni sotto).  
- **Compliance base**: definire minimo necessario (audit log + retention).  
- **AI scope**: conferma preview obbligatoria + auto‑apply con review (sì).  
- **Integrazioni prioritarie**: scegliere 3–5 per Italia (proposte sotto).

---

## 1) Value Proposition & Use‑Case “Wow” (Studi Professionali)
**Obiettivo**: rendere chiaro il valore in 1‑2 settimane d’uso.

### Use‑case consigliati (proposte)
1. **Incarico + raccolta dati + firma + fattura**  
   - Template incarico → invio firma → archiviazione → fattura automatica.
2. **Anagrafica cliente + documento standard + approvazione**  
   - Email/Slack inbound → estrazione dati → generazione documento → conferma/approvazione.
3. **Pratica ricorrente (mensile)**  
   - Trigger manuale → generazione documenti → notifiche → archivio.

**Deliverable**
- 3 workflow “template” pronti in libreria (con copy, step, preview)
- 1 demo guidata end‑to‑end in onboarding

**Dipendenze**
- Libreria template doc + workflow (Fase 2/3)

---

## 2) Onboarding Assistito + Libreria Template
**Obiettivo**: time‑to‑value < 1 ora.

**Work**
- Wizard di onboarding (3‑5 step):
  - Crea/Seleziona company
  - Scegli use‑case
  - Collega integrazioni richieste
  - Importa o scegli template
  - Avvio primo workflow
- Libreria template per studi (documenti + workflow)
- CTA “Crea workflow da template” in home

**Outcome utente**
- Primo workflow funzionante senza configurazioni tecniche.

---

## 3) Design System “Liquid Glass” + UX semplificata
**Obiettivo**: UI minimale, premium, out‑of‑the‑box.

**Work**
- Nuovo design system: glass surfaces, layering, micro‑motion essenziale
- Riduzione componenti “tecnici” in editor
- Drawer/Modal puliti, meno configurazioni visibili di default
- Workflow editor “focus canvas” + configurazione contestuale

**Outcome utente**
- Percezione premium e riduzione attrito.

---

## 4) AI Auto‑Setup (Workflow + Doc Manager)
**Obiettivo**: automation‑first, ridurre configurazioni manuali.

**Scope**
- AI crea workflow da prompt (preview → apply → review)
- AI auto‑configura template doc manager
- AI capisce binding key + segnala campi senza key
- AI può aggiungere blocchi o modificare workflow esistenti

**Outcome utente**
- Workflow creati/aggiornati con pochissime azioni manuali.

---

## 5) Integrazioni Prioritarie (Italia)
**Obiettivo**: rendere Reglo immediatamente utile per studi italiani.

### Integrazioni consigliate (ordine suggerito)
1. **Firma digitale EU/eIDAS** (must‑have)  
   - Opzioni: **Namirial**, **InfoCert/GoSign**, **Aruba** (provider EU, molto usati in Italia).  
   - Goal: firma semplice da workflow, traccia e audit.
2. **PEC** (alto valore percepito in Italia)  
   - Inbound PEC → trigger → workflow (pratiche/documenti).
3. **Google Workspace / Microsoft 365**  
   - Sync file / email / calendario.
4. **CRM leggero** (HubSpot o Pipedrive)  
   - Collegamento anagrafiche + pipeline base.
5. **Archiviazione** (Drive/Dropbox)  
   - Salvataggio automatico documenti finali.

**Nota**: se serve convalida legale forte, eIDAS è priorità assoluta.

---

## 6) Affidabilità & Compliance base
**Obiettivo**: fiducia per studi e clienti finali.

**Work**
- Audit log minimale (chi/azione/quando)
- Run history leggibile con “cause” chiare
- Retention configurabile (30/90/365 giorni)
- Notifiche errore con remediation

**Outcome utente**
- Reglo “affidabile” anche per usi legali.

---

## 7) Pricing & Packaging (Proposte)
**Valutazione piani attuali**
- Sono chiari e scalabili, ma rischiano di sembrare “limitati” se l’utente non percepisce il valore.
- Suggerisco:
  - **Core**: enfatizzare “1 workflow attivo + doc AI”
  - **Growth**: “workflow completi + integrazioni avanzate”
  - **Scale**: “AI avanzata + SLA + audit avanzato”

**Proposta aggiustamenti**
- Aggiungere **quota AI** per piano (visibile)
- Extra: pacchetti AI e documenti come add‑on
- Incentivo annuale (‑15%)

**Add‑ons consigliati**
- +AI Requests (pacchetto mensile)
- +Firma digitale (per company)
- +PEC (per company)

---

## 8) KPI consigliati (per priorità)
**Primario**: Activation (prima automazione funzionante).  
**Secondari**: conversione trial → paid, churn a 90 giorni, ARPA.

---

## Output finali del plan
- 3 workflow template “wow” per studi professionali
- Libreria template documenti pre‑configurati
- AI auto‑setup su workflow + doc manager
- Integrazione firma digitale EU/eIDAS
- Onboarding assistito con wizard
- Design system liquid glass v1
- Audit log base + run history migliorata

---

## Cosa serve da parte tua (input)
- Scegli provider firma digitale (Namirial / InfoCert / Aruba)
- Conferma top‑3 integrazioni Italia
- 3 documenti reali + 3 workflow reali per template
- Approva KPI priorità (Activation first)

