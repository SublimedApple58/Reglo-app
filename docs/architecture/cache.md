# Cache System

## Stack
Upstash Redis (serverless). Graceful degradation: if Redis unavailable, reads return null, writes are no-ops.

## File
`lib/autoscuole/cache.ts`

## Mechanism
Version-based invalidation per segment per company.

Key pattern: `autoscuole:v1:{companyId}:{segment}:v{version}:{scope}`
Version key: `autoscuole:v1:{companyId}:{segment}:version`

Inputs hashed with SHA1, sorted alphabetically for deterministic keys.

## Segments
| Segment | What it caches | Invalidated by |
|---------|---------------|----------------|
| `AGENDA` | Appointment schedules, availability, slots | Appointment changes, availability changes, holidays, repositioning, swaps |
| `PAYMENTS` | Payment status, credits, settlement | Payment changes, credit adjustments, cancellations, swaps, holidays |
| `STRIPE` | Stripe Connect account status | Stripe Connect updates |
| `FIC` | Fatture-in-Cloud invoice status | Invoice finalization |

## Invalidation callers
- `autoscuole.actions.ts` — AGENDA, PAYMENTS
- `autoscuole-availability.actions.ts` — AGENDA
- `autoscuole-swap.actions.ts` — PAYMENTS
- `autoscuole-holidays.actions.ts` — AGENDA, PAYMENTS
- `autoscuole-settings.actions.ts` — AGENDA, STRIPE
- `payments.ts` — PAYMENTS, FIC (internal)
