# AI Integration Plan

## Goals
- Let users create a workflow from a prompt with a clear preview and confirmation.
- Use AI to auto-configure doc manager templates and field bindings.
- Keep results grounded in what Reglo can do now (no fake blocks or missing integrations).

## Assumptions
- We can send full document content to OpenAI.
- AI can ask up to 1-2 clarification questions before generating a preview.
- Only existing, working blocks are used. If a requested service is not integrated:
  - If Reglo does not support it, AI must say it cannot do it.
  - If Reglo supports it but the company has not connected it, AI must ask to connect first.
- UX needs a friendly "AI thinking" animation while we wait for responses.
- Preview is shown first and supports re-prompt before applying changes.
- Tone: concise but friendly.
- AI can create new binding keys (not just map existing).
- Cost control: monitor-only in MVP (no hard caps/blocks).

## Phase 0 - Setup and Access
**Scope**
- Create OpenAI project and API key with billing.
- Wire env vars for dev and prod.

**What you need to provide**
- OpenAI API key (billing enabled).
- Budget guidance (monthly limit or target spend).
- Sample prompts (5-10) for realistic workflows.
- 2-3 real templates/documents to test auto-config.

**What I implement**
- Server-side AI gateway (single place to call OpenAI).
- Base prompt scaffolding + JSON schema validation.
- Safe error handling and rate limits.
- Usage telemetry (token usage + cost estimate per request/company).

**User outcome**
- Internal API ready to call OpenAI from Reglo.

**Notes**
- No DB migrations expected unless we decide to persist AI requests/responses or detailed usage history.

## Phase 1 - Workflow From Prompt (Preview First)
**Scope**
- AI prompt input in workflow creation.
- AI returns: trigger, blocks, edges, and config suggestions.
- Render a preview (example canvas) before applying.
- Allow user to confirm, request changes, or cancel.

**Implementation details**
- Prompt context includes:
  - Available blocks
  - Connected integrations for the company
  - Available templates and binding keys
  - Trigger options and constraints
- Response schema (validated):
  - Title, trigger, blocks[], edges[], block configs, warnings
  - Clarification questions (max 2)
- Preview UI:
  - Modal with a mini graph preview
  - Clear CTA: "Apply to canvas", "Edit prompt", "Ask changes"
- Animation:
  - A clean "AI is thinking" loader in the modal

**What you need to provide**
- 5-10 example prompts to calibrate responses.

**User outcome**
- Users can create a workflow from a prompt and see a safe preview before saving.

**Tech and patterns**
- JSON schema validation with Zod
- Strict prompt + constraints to avoid hallucinated blocks
- Guardrails for missing integrations

**Potential migrations**
- None required unless we log AI generations.

## Phase 2 - Doc Manager Auto-Configuration
**Scope**
- AI reads a template/PDF and proposes fields + binding keys.
- User reviews, edits, and confirms the configuration.

**Implementation details**
- Extract text from the template/PDF.
- Send content to AI with a schema:
  - Detected fields
  - Suggested labels
  - Suggested binding keys
  - Confidence indicators
- UI preview before applying changes to the template.

**What you need to provide**
- 2-3 real documents to validate extraction quality.

**User outcome**
- Users can auto-configure templates in seconds with a review step.

**Potential migrations**
- None required unless we store AI suggestions or audit logs.

## Phase 3 - (Future) Assistant
- Conversational assistant to guide users and generate workflows.
- Reuses the same AI gateway and schema constraints.

## Technical Notes (Documentation Deliverable)
- AI gateway architecture (server action + OpenAI SDK).
- Prompting patterns (system prompt, constraints, JSON schema).
- How to add new blocks and make them AI-compatible.
- Cost controls (token limits, model choice, rate limits).
- Monitoring-only usage policy (no hard caps, telemetry only).
- Privacy and logging policy.

## Deliverables Checklist
- [ ] OpenAI API key + billing configured
- [ ] AI gateway + schema validation
- [ ] Workflow prompt -> preview -> apply flow
- [ ] "AI thinking" animation
- [ ] Doc manager auto-config (preview + apply)
- [ ] Technical docs for AI patterns and usage
