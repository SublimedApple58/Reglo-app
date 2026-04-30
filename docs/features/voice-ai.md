# Voice AI

## What it does
AI voice secretary: answers incoming calls, uses company knowledge base, handles call transfer/callback.

## Key files
- `lib/autoscuole/voice.ts` — AI assistant logic (56KB)
- `lib/autoscuole/voice-webhook.ts` — webhook handling
- `lib/twilio.ts` — Twilio SDK integration
- `lib/telnyx.ts` — Telnyx integration
- `app/api/voice/twilio/` — incoming, status, recording, transfer-fallback
- `app/api/voice/telnyx/` — call-control, tools
- `components/pages/Autoscuole/AutoscuoleVoicePage.tsx` — web UI (44KB)

## Voice settings (on CompanyService limits JSON)
- `voiceRecordingEnabled`, `voiceTranscriptionEnabled`
- `voiceRetentionDays`: 90 (fixed)
- `voiceLegalGreetingEnabled`, `voiceCustomGreeting`
- `voiceHandoffPhone`, `voiceHandoffDuringCallEnabled`, `voiceHandoffDuringCallInstructions`
- `voiceFallbackMode`: "transfer_or_callback"
- `voiceAssistantVoice` — TTS voice ID
- `voiceOfficeHours` — daysOfWeek, startMinutes, endMinutes

## DB models
- `AutoscuolaVoiceLine` — phone number (Twilio SID, display number, routing mode)
- `AutoscuolaVoiceCall` — call record with duration, recordingSid/Url, transcriptText, outcome, needsCallback
- `AutoscuolaVoiceCallTurn` — speaker turns
- `AutoscuolaVoiceCallbackTask` — follow-up tasks (status: pending/done, attempts)
- `AutoscuolaVoiceKnowledgeChunk` — AI knowledge base (scope: global/company, tags, language)

## Connected features
- **Instructor Clusters** — voice settings stored in company settings
- Mostly self-contained (Twilio/Telnyx webhooks, knowledge base, call records)
- Background job handles voice retention cleanup
