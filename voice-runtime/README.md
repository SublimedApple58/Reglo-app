# Reglo Voice Runtime (V1 scaffold)

Questo modulo contiene lo scaffold del runtime voce separato (`Twilio Voice <-> OpenAI Realtime`) richiesto per la segretaria AI.

## Stato attuale

- Endpoint backend e persistenza chiamate sono già disponibili nella web app (`/api/voice/*` e `/api/autoscuole/voice/*`).
- Questo runtime è uno scaffold operativo minimo da usare come base deploy separata (es. Railway EU).
- Richiede secret condiviso per chiamare `POST /api/voice/runtime/tool`:
  - `VOICE_RUNTIME_SHARED_SECRET`

## Variabili attese

- `REGLO_API_BASE_URL`
- `VOICE_RUNTIME_SHARED_SECRET`
- `PORT` (default `8080`)

## Avvio

```bash
node server.js
```

## Nota

La parte di bridge audio realtime Twilio/OpenAI va completata nel deploy runtime dedicato; in questa iterazione è stato implementato il foundation layer (configurazione BO/autoscuola, webhook, audit, knowledge, callback, retention).
