# Reglo Autoscuole — Preparatory Plan

## 0) Context & Goal
Reglo becomes modular:
- **Core services**: Doc Manager, Workflows (independently purchasable)
- **Vertical modules**: first is **Reglo Autoscuole**

We must prepare Reglo to support:
- **Company-specific service entitlements** (which services are active)
- A **Backoffice** to enable/disable services per company
- A **Reglo Hub** framework for closed-system integrations
- A **baseline integration** to validate the Hub architecture

This plan is **preparatory**: we build the product scaffolding even before detailed SIDA tech specs.

---

## 1) Product Modularity (Core + Modules)
### 1.1 Data model (DB)
Create a formal entitlement layer:
- **ServiceCatalog**
  - id, key (doc_manager, workflows, autoscuole), name, description
- **CompanyService**
  - id, companyId, serviceKey, status (active/disabled), startedAt, endedAt, limits (JSON)
- **CompanyModuleConfig** (optional)
  - moduleKey, config JSON (future: autoscuole-specific settings)

### 1.2 Runtime gating
Implement a runtime guard system:
- Frontend: hide/disable navigation and routes for inactive services
- Backend: enforce authorization for service usage
- Workflows + Doc Manager become feature-flagged by entitlement

### 1.3 UI adjustments
- Settings page: show active services and remaining limits
- On restricted pages: show “Service not active” + CTA to upgrade

### 1.4 Billing strategy (preparatory)
Even before billing, enforce entitlements:
- Manual activation by backoffice
- Optional limits (document count, workflow runs)

---

## 2) Backoffice (Minimal Admin Web App)
### 2.1 Scope
- List companies
- View services active per company
- Toggle services ON/OFF
- (Optional) set limits (documents/workflows)

### 2.2 Implementation
- Simple internal page (admin-only role)
- Minimal CRUD for CompanyService table

---

## 3) Reglo Hub (Integration Platform)
### 3.1 Purpose
Standardize closed-system integrations with a common framework.

### 3.2 Core components
**Connector interface**
- authenticate()
- pullChanges(since)
- pushChanges(changes) *(future)*
- healthCheck()

**Canonical data model**
- Student
- Case
- Appointment
- Document
- Payment
- Instructor
- Vehicle

**Sync Engine**
- scheduled pulls (1/5/15 min)
- incremental sync (since)
- dedup
- retry + backoff
- conflict handling (future)

**Mapping & Rules**
- status mapping (external → Reglo)
- rule triggers for workflows

**Event Bus**
- student.created
- appointment.updated
- case.status_changed

**Integration Console**
- sync logs
- errors per record
- manual resolution

---

## 4) Baseline Integration (to validate Hub)
We need a **simple third-party** to validate Hub architecture before SIDA.
Criteria:
- Accessible API
- Read-only sync
- Student/Appointment-like data or analogous

Suggested candidates (to decide):
- Google Calendar (appointments)
- Airtable (student cases)
- Notion DB (students/cases)

Outcome: prove sync engine + canonical model + event triggers.

---

## 5) Reglo Autoscuole Module (Preparation)
### 5.1 Module scope
- Autoscuole module = **Reglo Hub + SIDA connector** + autoscuole-specific workflows

### 5.2 SIDA integration (preparatory only)
Assumption: Client/server with local DB.
Decision fixed:
- Agent on SIDA server
- Read-only DB access
- Push to Reglo via HTTPS

### 5.3 Agent design (skeleton)
- Windows service
- Config file (Reglo endpoint + token + db connection)
- Poll schedule
- Delta detection (since)

### 5.4 Data flow (V1)
- Read: students, cases, appointments
- Push into Reglo Hub canonical model
- Emit events
- Trigger workflows/portal actions

---

## 6) Deliverables (Prep Phase)
1) **Entitlement system** (DB + runtime gating)
2) **Backoffice mini-app** for toggling services
3) **Reglo Hub skeleton** (connector interface + sync engine stub)
4) **Baseline integration** (for validation)
5) **Autoscuole module scaffolding**

---

## 7) User Value After This Phase
- Reglo supports **multiple service configurations per company**
- Services are gated correctly
- Admin can activate modules without code changes
- Reglo Hub is ready to onboard SIDA when specs arrive

---

## 8) Open Questions (Deferred)
These are unknown now, but needed later:
- SIDA DB type + connection
- Required fields + mapping
- Sync interval constraints
- Data volume

We will fill them in once available.
