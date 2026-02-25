# Reglo Voice Runtime (V1 scaffold)

Questo modulo contiene il runtime voce separato (`Twilio Voice <-> OpenAI Realtime`) richiesto per la segretaria AI.

## Stato attuale

- Endpoint backend e persistenza chiamate sono già disponibili nella web app (`/api/voice/*` e `/api/autoscuole/voice/*`).
- Questo runtime espone un websocket Twilio Media Stream su `GET/WS /twilio/stream`.
- Da usare con deploy separato (es. Railway EU, Render, Fly).
- Richiede secret condiviso per chiamare `POST /api/voice/runtime/tool`:
  - `VOICE_RUNTIME_SHARED_SECRET`

## Variabili attese

- `REGLO_API_BASE_URL`
- `VOICE_RUNTIME_SHARED_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL` (default: `gpt-realtime`)
- `OPENAI_REALTIME_VOICE` (default: `alloy`)
- `OPENAI_REALTIME_URL` (opzionale override endpoint realtime)
- `PORT` (default `8080`)

## Avvio

```bash
cd voice-runtime
npm install
node server.js
```

## Deploy rapido (Railway)

1. Nuovo servizio da repo GitHub.
2. Imposta `Root Directory` = `voice-runtime`.
3. Start command = `npm run start`.
4. Env da impostare sul runtime:
   - `REGLO_API_BASE_URL=https://app.reglo.it`
   - `VOICE_RUNTIME_SHARED_SECRET=<segreto-lungo-casuale>`
   - `OPENAI_API_KEY=<chiave-openai>`
   - `OPENAI_REALTIME_MODEL=gpt-realtime`
5. Verifica health:
   - `https://<runtime-domain>/health`
6. Poi su Vercel (`reglo`) imposta:
   - `VOICE_RUNTIME_SHARED_SECRET=<stesso identico segreto>`
   - `VOICE_RUNTIME_TWILIO_STREAM_URL=wss://<runtime-domain>/twilio/stream`

## URL da impostare su Vercel (`reglo`)

Una volta deployato il runtime su dominio pubblico HTTPS/WSS, imposta:

```env
VOICE_RUNTIME_TWILIO_STREAM_URL=wss://<dominio-runtime>/twilio/stream
```

Questa e' la variabile letta da `/api/voice/twilio/incoming` per comporre il TwiML `<Connect><Stream ...>`.
