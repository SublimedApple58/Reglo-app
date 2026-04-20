# Migrazione Twilio → Telnyx (Opzione A)

## What was done

Implemented the full Telnyx integration as the new telephony provider, replacing Twilio for number provisioning while maintaining the same voice-runtime/WebSocket infrastructure.

### Files created
- `lib/telnyx.ts` — API wrapper (fetch-based, no SDK)
- `app/api/voice/telnyx/incoming/route.ts` — incoming call webhook (TeXML-compatible)
- `app/api/voice/telnyx/status/route.ts` — call status callback
- `app/api/voice/telnyx/recording/route.ts` — recording callback
- `app/api/voice/telnyx/transfer-fallback/route.ts` — transfer failure reconnect
- `scripts/migrate-twilio-to-telnyx.ts` — one-shot migration of existing clients

### Files modified
- `lib/actions/backoffice.actions.ts` — provisioning now uses Telnyx API (local numbers instead of toll-free 800)
- `lib/autoscuole/voice.ts` — added `verifyTelnyxSignature()` (Ed25519)
- `components/pages/Backoffice/BackofficeCompaniesPage.tsx` — added "telnyx" routing mode in UI
- `voice-runtime/server.js` — added fallback for `event.start.parameters` (Telnyx compat)

### Env vars required
```
TELNYX_API_KEY=KEYxxxxxxxxx
TELNYX_WEBHOOK_BASE_URL=https://app.reglo.it
TELNYX_TEXML_APP_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
TELNYX_IT_REQUIREMENT_GROUP_ID=xxxxxxxx
TELNYX_PUBLIC_KEY=<base64 public key from Telnyx console>
TELNYX_DISABLE_SIGNATURE_CHECK=1  (dev only)
```

### Migration steps (post-deploy)
1. Complete Fase 0 (manual validation on Telnyx console)
2. Set env vars in Vercel
3. Deploy
4. Test provisioning a new number via backoffice
5. Run `npx tsx scripts/migrate-twilio-to-telnyx.ts --dry-run` to preview
6. Run `npx tsx scripts/migrate-twilio-to-telnyx.ts` to migrate live
7. Notify clients with new numbers + deactivation instructions

### Key decisions
- Telnyx TeXML webhook format is identical to TwiML (same field names: CallSid, From, To, etc.)
- WebSocket stream protocol is compatible — one-line fallback added for `parameters` vs `customParameters`
- `routingMode` field is a free string in DB — no Prisma migration needed
- Twilio code kept in place for existing SIP/legacy clients
- Default routing mode changed to `"telnyx"` for new assignments
