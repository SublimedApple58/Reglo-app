# Reglo Hub — Plan (Integration Platform)

## 0) Goal
Build **Reglo Hub** as the standard integration layer for closed/legacy systems (SIDA, DriveLab, etc.).
Hub must be reusable, secure, observable, and minimal enough to ship early.

**Primary outcomes:**
- One integration framework, not one-off connectors.
- Canonical data model → Reglo workflows/events can be reused across verticals.
- Reliable sync engine (delta, retry, dedup, idempotency).

---

## 1) Scope (V1)
**In scope:**
- Connector interface + SDK
- Canonical data model (core entities)
- Sync engine (polling + delta)
- Ingestion API (push to Reglo)
- Event generation to trigger workflows
- Integration Console (basic health + sync logs)

**Out of scope (V1):**
- Bidirectional writes to external systems
- Complex conflict resolution
- Multi-tenant agent orchestration
- Advanced mapping UI

---

## 2) Architecture (V1)
```
External System (SIDA) → Local Agent → Reglo Hub API → Canonical Model
                                                ↓
                                        Event Bus → Workflows/Notifications
```

**Decision (V1):** Hub lives inside Reglo backend as a module (no separate infra yet). This keeps deployment and auth simple. Can be extracted later.

---

## 3) Canonical Data Model (minimal)
**Entities:**
- `Student` (Allievo)
- `Case` (Pratica + stato)
- `Appointment` (Guida/Esame)
- `Document`
- `Payment`
- `Instructor`
- `Vehicle`

**Notes:**
- Each entity includes `externalId`, `sourceSystem`, `companyId`.
- Use `updatedAt` + `sourceUpdatedAt` for delta detection.

---

## 4) Connector Interface (SDK spec)
Each connector implements:
- `authenticate()`
- `pullChanges(since)`
- `healthCheck()`
- `mapToCanonical()`
- (future) `pushChanges()`

**Contract:**
- Outputs **canonical objects** + metadata
- Returns `cursor` for incremental sync
- Guarantees stable external IDs

---

## 5) Sync Engine
**Core behavior:**
- Polling scheduler (default **1 minute**)
- Delta sync via `since` cursor
- Dedup by `(sourceSystem, externalId, companyId)`
- Retry with exponential backoff
- Idempotent writes

**Storage:**
- `integration_sources` table (connector config)
- `integration_runs` table (run status, metrics)
- `integration_events` (one per canonical event)

---

## 6) Ingestion API (Reglo Hub API)
**Endpoint:** `POST /api/hub/ingest`
- Auth via `Agent API Key` + HMAC signature
- Payload includes `sourceSystem`, `companyId`, `cursor`, `data[]`
- Server validates schema and writes to canonical tables
- **Validation policy (V1):** accept records with warnings (non‑blocking)

---

## 7) Event Bus + Workflow Hooks
Hub emits events:
- `student.created`
- `student.updated`
- `case.status_changed`
- `appointment.created`
- `appointment.updated`

Events are written to `integration_events`, then forwarded to workflow engine.

---

## 8) Integration Console (Backoffice-lite)
Minimal UI for admins/support:
- Integration status (OK / Warning / Failed)
- Last sync timestamp
- Error logs per run
- Manual retry

---

## 9) Security & Compliance
- **Agent API keys** (per company/source)
- HMAC signature of payload
- IP allowlist optional
- Data masking for logs
- Rate limit per agent

---

## 10) Proposed Development Phases
### Phase 1 — Hub Core
- Canonical tables + models
- Ingestion API (auth + validation)
- Event generation

### Phase 2 — Connector Framework
- SDK + base connector
- Sync engine + scheduling
- Integration run logs

### Phase 3 — Integration Console
- UI + basic actions

### Phase 4 — Baseline Connector
- **CSV connector** (baseline)
- Validate full pipeline end‑to‑end

---

## 11) Locked Decisions (V1)
- **Agent language:** Node
- **Polling default:** every 1 minute
- **Schema validation:** accept + warning (non‑blocking)
- **Baseline connector:** CSV
## 12) Required Inputs (from you)
- Which entity fields are **must-have** in Reglo

---

## 13) Open Questions
1) Will Hub run as internal module or separate microservice later?
2) Do we need per-entity versioning from day 1?
3) Do we need per-company mapping rules in V1?
4) Target connector for initial validation (non‑SIDA)?

---

## 14) What the user can do after Hub V1
- Connect a read‑only source via agent
- See synced Students/Cases/Appointments in Reglo
- Trigger workflows from real events
- Monitor sync health in Backoffice
