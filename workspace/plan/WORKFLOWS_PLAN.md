# Workflow & Integrations Plan

## Goals
- Deliver a production-ready workflow backend that runs reliably in a serverless environment.
- Provide a generic integration framework so new services can be added quickly.
- Ship P0 integrations and triggers to validate the architecture end-to-end.

## Assumptions
- Execution should stay on Vercel (no dedicated worker/Redis initially).
- Trigger.dev can be used to orchestrate workflow runs and retries.
- Workflow storage is JSON-based (single workflow definition per record).
- P0 triggers: manual UI, inbound email (Resend), internal event (document completed).
- P0 integrations: Slack App actions and Fatture in Cloud actions (no WhatsApp).

## Phase 1 — Workflow Core Data Model
- Store workflow definition as JSON (nodes, edges, config) per company.
- Define runtime entities:
  - WorkflowRun: status, trigger payload, timestamps.
  - WorkflowRunStep: per-node status, input/output, error, retry count.
- Define variable interpolation format (e.g., {{trigger.payload.*}}, {{step.<id>.output.*}}).
- User outcome:
  - Users can save workflows and see structured run history data once execution is wired.
- Success metrics:
  - Workflow schema passes validation for 100% of saved workflows.
  - Run and step tables persist data without errors in dev/staging.
- Requirements:
  - DB migration access for new workflow tables.
  - Agreement on workflow JSON schema and node config contracts.
- Status:
  - Completed.
  - Implemented `Workflow`, `WorkflowRun`, `WorkflowRunStep` in `prisma/schema.prisma`.
  - Migration applied: `prisma/migrations/20260115012332_add_workflows`.
  - Added workflow validators (`workflowDefinitionSchema`, `createWorkflowSchema`, `updateWorkflowSchema`) in `lib/validators.ts`.

## Phase 2 — Execution Layer (Trigger.dev)
- Implement runner to execute steps sequentially.
- Add IF + LOOP logic for branches (using trigger + prior step outputs).
- Add retries, backoff, and failure handling with step-level status updates.
- Plan waitpoint support (pause/resume runs) for long-running workflows and approvals.
- User outcome:
  - Users can run workflows reliably and see step-by-step execution statuses.
- Success metrics:
  - 95%+ of runs complete without manual retries in staging.
  - Step status transitions are consistent and visible in run logs.
- Requirements:
  - Trigger.dev account (free tier ok) and project created.
  - Trigger.dev API keys + webhook signing secret.
 - Status:
   - Completed.
   - Trigger.dev runner wired (`trigger/workflow-runner.ts`) with IF/LOOP, retry/backoff, waitpoints.
   - Workflow editor stores structured conditions (op/left/right) and branches.
   - Added manual “Run now” + run history UI.
   - Added “Wait” block with configurable timeout.

## Phase 3 — Integrations Framework
- Define provider interface and registry ("workflow-compliant" adapter contract).
- Define config schema + validation for each block type.
- Store per-company integration credentials securely (OAuth tokens).
- User outcome:
  - Users can configure blocks with validated inputs once providers are connected.
- Success metrics:
  - New provider adapter can be added with <1 day of dev time.
  - Validation errors are surfaced before run start for 90%+ of misconfigurations.
- Requirements:
  - Decision on secrets storage (DB encryption method) and OAuth callback URLs.

## Phase 4 — Integrations UI
- Settings > Integrations: connect/disconnect flows for Slack + Fatture in Cloud.
- Workflow editor: form-based configuration for each block.
- User-friendly validation + previews for block inputs.
- User outcome:
  - Users can connect their own accounts, configure blocks without coding, and validate inputs before publish.
- Success metrics:
  - Users can complete OAuth connect in under 2 minutes.
  - 80%+ of workflows are configured without support intervention in pilot testing.
- Requirements:
  - UX copy for integration status/errors.
  - Approved OAuth redirect URLs for prod/staging.
- Status:
  - Completed.
  - Settings > Integrations connects/disconnects Slack + Fatture in Cloud.
  - OAuth status feedback shown via Settings toasts.
  - Workflow editor supports per-block config modals + non-blocking warnings for missing fields.

## Phase 5 — P0 Integrations & Triggers
- Slack App actions: send message, reply in thread, upload file, notify status.
- Fatture in Cloud actions: create invoice, update status, send PDF, list invoices.
- Doc Manager internal actions: upload document, request signature, update status, archive.
- Triggers:
  - Resend inbound email
  - Internal event: document completed
  - Manual trigger from UI
- User outcome:
  - Users can automate Slack + Fatture in Cloud + Doc Manager tasks and start workflows from email or document events.
- Success metrics:
  - End-to-end workflow runs succeed for each P0 integration in staging.
  - Resend inbound and document completed triggers fire within 30s.
- Requirements:
  - Slack App credentials (client ID/secret), bot token, and scopes approved.
  - Resend account + inbound domain setup + webhook secret.
  - Fatture in Cloud developer account + OAuth app credentials + sandbox data.
  - Clarify Doc Manager internal events and action payloads.

## Phase 6 — Testing & Documentation
- Integration test harness with mocked providers.
- Run/step logging and admin debug tools.
- Technical docs:
  - Patterns used (runner, adapters, config validation)
  - Tech stack choices and why
  - How to add a new integration
- User outcome:
  - Users get stable releases; support can diagnose failures quickly.
- Success metrics:
  - Integration test suite covers all P0 blocks and triggers.
  - On-call can trace a failed run to root cause in <10 minutes.
- Requirements:
  - Test accounts for Slack/Resend/Fatture in Cloud.
  - Agreement on logging retention and PII handling.

## Deliverables Checklist
- [ ] Workflow JSON model + run history tables
- [ ] Trigger.dev runner + step execution
- [ ] Slack actions
- [ ] Fatture in Cloud actions
- [ ] Resend inbound trigger
- [ ] Internal "document completed" trigger
- [ ] Integrations settings UI
- [ ] Documentation + test scaffolding
