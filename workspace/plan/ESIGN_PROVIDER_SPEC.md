# E-Signature Provider Spec (Reglo)

## Obiettivo
Reglo deve offrire **firma digitale out-of-the-box** per i clienti (studi professionali), senza che il cliente debba attivare o collegare un account proprio. Serve un provider **EU/eIDAS** con API solide, multi-tenant, white-label e pricing OEM/ISV.

## Provider consigliati da contattare
1) **Namirial** (prima scelta, Italia/EU, forte per studi professionali)  
2) **DocuSign** (seconda scelta, API mature, costo piu alto)  

> Se Namirial non copre alcuni requisiti (OEM/white-label / scalabilita / region EU), passare a DocuSign.

---

## Requisiti funzionali (must-have)
- **Tipo firma**: firma elettronica avanzata (AdES) + possibilita di QES (qualificata) su richiesta.
- **Embedded signing**: firma dentro Reglo (iframe/redirect controllato), senza uscire dal prodotto.
- **Multi-signer**: piu firmatari, ordine di firma, CC.
- **Template e campi**: supporto template e campi posizionabili (text, date, checkbox).
- **Audit trail**: log completo, legal evidence, hash documento, timestamp.
- **Invio email**: Reglo deve poter inviare le email di firma con branding proprio.
- **Documenti**: PDF multipagina, allegati, merge di documenti.

---

## Requisiti tecnici (API)
- **API REST** con SDK disponibili (Node/TS preferibile).
- **Webhooks**: eventi di firma (sent, viewed, signed, completed, declined, expired).
- **Idempotenza**: supporto idempotency keys.
- **Rate limits**: dichiarati e adeguati (>= 50 req/min per tenant).
- **Sandbox**: ambiente di test con firme simulate e watermark.
- **Data region**: EU data center garantito.
- **Retenzione**: configurabile (30/90/365 giorni) e cancellazione GDPR.

---

## Requisiti multi-tenant / OEM
- **Modalita ISV/OEM**: un account Reglo che gestisce firme per molte company.
- **Isolamento dati**: per company (audit, documenti, firmatari separati).
- **Billing centralizzato**: Reglo paga, non il cliente finale.
- **Branding**: logo Reglo, email e pagina firma white-label.
- **Sub-accounts** (se disponibili): per separazione clienti.

---

## Compliance & Legal
- **eIDAS compliance** (EU) con supporto AdES e QES.
- **Timestamping** e sigillo elettronico dove necessario.
- **Audit trail legalmente valido**.
- **DPA / GDPR**: Data Processing Agreement disponibile.

---

## Domande da fare al provider
### 1) Licensing / Pricing
- Pricing **OEM/ISV** per firma (per envelope / per signature / per documento)?
- Sconti a volume (es. 1k/5k/10k firme/mese)?
- Esistono **costi minimi mensili**?
- Costi per QES (separati)?
- Costi per evidenze legali / audit avanzato?

### 2) API & Integrazione
- Avete **API per embedded signing** e white-label completo?
- Supportate **webhook** realtime? Quali eventi?
- SDK ufficiali Node/TS?
- Limiti rate e policy di retry?
- Tempo medio per onboarding tecnico?

### 3) Multi-tenant
- Avete un modello **multi-tenant / sub-account**?
- Come isolate i dati per cliente finale?
- Possiamo gestire **companyId** come namespace?

### 4) Email & Branding
- Possiamo inviare email di firma con **domain Reglo**?
- Possiamo personalizzare **logo, colori, footer, testi legali**?

### 5) Compliance & Data
- **Data residency EU** garantita?
- DPA disponibile? Data retention configurabile?
- Processo di cancellazione completa dei dati?

### 6) Operativita
- SLA uptime? Supporto tecnico? Canale escalation?
- Sandbox e test environment disponibili?
- Tempi di provisioning per produzione?

---

## Info da preparare per il vendor
- Numero stimato di firme/mese per cliente (range target).
- Numero clienti (company) attesi a 6/12/24 mesi.
- Regioni: EU only.
- Use-case principali (studi professionali).

---

## Criteri di scelta
1) **eIDAS + embedded signing + white-label** (obbligatorio)
2) **Pricing OEM/ISV sostenibile** (margine > 93%)
3) **Data residency EU** e GDPR chiaro
4) **Stabilita API + webhooks**
5) **Facilita onboarding**

---

## Prossimi passi
- Contattare Namirial e DocuSign con la lista domande sopra.
- Richiedere documentazione API + preventivo OEM/ISV.
- Valutare costi per firma e impatto sul pricing Reglo.

