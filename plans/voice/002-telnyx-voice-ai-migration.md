# Voice AI: Railway+OpenAI Realtime → Telnyx Voice AI Agents

## What was done

Migrated the voice AI architecture from a 3-component setup (Telnyx TeXML → Railway WebSocket → OpenAI Realtime) to a managed Telnyx Voice AI Agents solution (Telnyx Call Control → Telnyx AI Assistant).

### Files created
- `app/api/voice/telnyx/call-control/route.ts` — Call Control webhook handling `call.initiated`, `call.answered`, `call.hangup`, `call.recording.saved`
- `app/api/voice/telnyx/tools/route.ts` — Webhook tool endpoint for Telnyx AI (search_knowledge, find_student, check_availability, create_appointment, create_callback, verify_student_dob)

### Files modified
- `lib/telnyx.ts` — Added `telnyxCallControl()` helper for Call Control API actions
- `lib/autoscuole/voice.ts` — Added `buildTelnyxSessionInstructions()`, `buildTelnyxGreeting()`, `buildTelnyxWebhookTools()`, `buildTelnyxAssistantStartBody()`, `isWithinOfficeHours()`, `resolveTelnyxVoice()`, `TELNYX_VOICE_MAP`, `TELNYX_VOICE_OPTIONS`
- `components/pages/Autoscuole/AutoscuoleVoicePage.tsx` — Updated VOICE_OPTIONS to Telnyx KokoroTTS voices
- `app/api/voice/preview/route.ts` — Switched from OpenAI TTS to Telnyx TTS API
- `package.json` — Removed `voice:runtime` script

### Files deleted
- `voice-runtime/` (entire directory — Railway WebSocket server)
- `app/api/voice/telnyx/incoming/route.ts` (replaced by call-control)
- `app/api/voice/telnyx/status/route.ts` (handled by call-control)
- `app/api/voice/telnyx/recording/route.ts` (handled by call-control)
- `app/api/voice/telnyx/transfer-fallback/route.ts` (transfer is now native Telnyx)

### Env vars
- **Add on Vercel**: `TELNYX_AI_ASSISTANT_ID` (ID from Telnyx Mission Control)
- **Remove on Vercel** (after migration): `VOICE_RUNTIME_TWILIO_STREAM_URL`, `VOICE_RUNTIME_SHARED_SECRET`

### Manual steps required (Telnyx Console)
1. Create AI Assistant base in Mission Control (name: "Reglo Segretaria", language: Italian)
2. Save the `assistant_id` → set as `TELNYX_AI_ASSISTANT_ID` env var
3. Create Call Control App with webhook URL: `https://app.reglo.it/api/voice/telnyx/call-control`
4. Reassign phone number `+39 0542 371032` from TeXML App to new Call Control App

### Voice mapping
Legacy OpenAI voices are auto-mapped to Telnyx KokoroTTS via `TELNYX_VOICE_MAP`. Voices should be tested for Italian quality and adjusted.

### Preserved functionality
- Per-autoscuola custom instructions, voice, tools, office hours, handoff, booking flow
- FAQ search, student lookup, availability check, appointment booking, callback creation
- Recording and transcript storage
- Office hours check with fallback/transfer
