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
- `components/pages/Autoscuole/AutoscuoleVoicePage.tsx` — pagina Segretaria (saluto con typewriter + "Chiamate in sospeso" con Info/Chiama/Fatto; modal Info con player registrazione e trascrizione quando disponibili)
- `components/pages/Autoscuole/VoiceSettingsPane.tsx` — pane "Segretaria" dell'overlay Impostazioni (sub-tabs Linea / Comportamento ed azioni / Orari e registrazioni / Istruzioni; salvataggi immediati su toggle, su blur per le textarea)
- `components/pages/Autoscuole/dialogs/VoiceLineTutorialModal.tsx` — tutorial "Collega il numero": solo deviazione incondizionata ("sempre"); scelta cellulare/fisso (i codici GSM sono identici tra operatori: **21 su mobile, *21 su fisso con note per gestore); CTA "Attiva segretaria" sbloccata da tipo linea + handoff

## Web UX (redesign 2026-07)
- Le impostazioni NON vivono più in un pannello laterale sulla pagina voice: sono il pane `?tab=settings&pane=voice`.
- Attivazione linea: onboarding nel pane → tutorial → `voiceAssistantEnabled: true` (+ handoff). Disattivazione: toggle "Linea attiva" con conferma rossa.
- I sub-tab oltre "Linea" compaiono solo a linea attiva (come da prototipo).
- `getVoiceCallbackTasks` include anche `call { startedAt, durationSec, recordingUrl, transcriptText }` per il modal Info. Nota: `recordingUrl` è popolato dai webhook Telnyx (mp3 pubblico); `transcriptText`/turni oggi NON arrivano dal voice-runtime (0 su prod) — la UI mostra le sezioni solo se presenti.

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
