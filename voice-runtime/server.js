"use strict";

const http = require("http");
const crypto = require("crypto");
const { WebSocket, WebSocketServer } = require("ws");

const port = Number(process.env.PORT || 8080);
const apiBaseUrl = (process.env.REGLO_API_BASE_URL || "").replace(/\/$/, "");
const sharedSecret = process.env.VOICE_RUNTIME_SHARED_SECRET || "";
const openAiApiKey = process.env.OPENAI_API_KEY || "";
const openAiModel = process.env.OPENAI_REALTIME_MODEL || "gpt-realtime";
const openAiRealtimeUrl =
  process.env.OPENAI_REALTIME_URL ||
  `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(openAiModel)}`;
const assistantVoice = process.env.OPENAI_REALTIME_VOICE || "alloy";

const OPENAI_CONNECT_TIMEOUT_MS = 8000;
const MAX_PENDING_AUDIO_CHUNKS = 200;
const WS_KEEPALIVE_INTERVAL_MS = 30000;

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
};

const signPayload = (raw) => {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", sharedSecret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  return { timestamp, signature };
};

const callTool = async (payload) => {
  if (!apiBaseUrl) {
    throw new Error("REGLO_API_BASE_URL non configurata.");
  }
  if (!sharedSecret) {
    throw new Error("VOICE_RUNTIME_SHARED_SECRET non configurata.");
  }

  const raw = JSON.stringify(payload);
  const { timestamp, signature } = signPayload(raw);
  const response = await fetch(`${apiBaseUrl}/api/voice/runtime/tool`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-reglo-runtime-timestamp": timestamp,
      "x-reglo-runtime-signature": signature,
    },
    body: raw,
  });
  return response.json();
};

const safeJsonParse = (raw, fallback = null) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const normalizeCompanyName = (value) => {
  if (typeof value !== "string") return "Autoscuola";
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned || "Autoscuola";
};

const buildSessionInstructions = (state, customInstructions = "") => {
  const actions = state.voiceAllowedActions.length
    ? state.voiceAllowedActions.join(", ")
    : "faq, lesson_info";
  const companyName = normalizeCompanyName(state.companyName);

  const parts = [
    "Sei la segretaria AI di un'autoscuola italiana.",
    `Nome autoscuola: ${companyName}.`,
    "Rispondi solo in italiano con tono naturale, umano e diretto.",
    "Niente giri di parole: frasi brevi e subito orientate alla richiesta.",
    "Non inventare mai regole o disponibilita'.",
    "Azioni consentite in questa chiamata: " + actions + ".",
    "Per informazioni didattiche usa search_knowledge.",
    "Se non puoi completare la richiesta, proponi callback e usa create_callback.",
    "Non condividere dati sensibili non richiesti.",
  ];

  if (customInstructions.trim()) {
    parts.push("Istruzioni aggiuntive della segreteria:");
    parts.push(customInstructions.trim());
  }

  return parts.join(" ");
};

const buildRealtimeTools = (state) => {
  const tools = [
    {
      type: "function",
      name: "search_knowledge",
      description:
        "Cerca informazioni affidabili sul regolamento autoscuola e sulle procedure operative.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      type: "function",
      name: "create_callback",
      description:
        "Crea una richiesta di richiamata quando non e' possibile completare la richiesta al telefono.",
      parameters: {
        type: "object",
        properties: {
          phoneNumber: { type: "string" },
          reason: { type: "string" },
          studentId: { type: "string" },
        },
        required: ["phoneNumber"],
      },
    },
  ];

  if (state.voiceBookingEnabled) {
    tools.push(
      {
        type: "function",
        name: "find_student",
        description: "Verifica se il numero chiamante appartiene a un allievo registrato.",
        parameters: {
          type: "object",
          properties: {
            phoneNumber: { type: "string" },
          },
          required: ["phoneNumber"],
        },
      },
      {
        type: "function",
        name: "verify_student_dob",
        description:
          "Verifica identita' allievo controllando data di nascita (formato YYYY-MM-DD).",
        parameters: {
          type: "object",
          properties: {
            phoneNumber: { type: "string" },
            dob: { type: "string" },
          },
          required: ["phoneNumber", "dob"],
        },
      },
    );
  }

  return tools;
};

const createCallState = (twilioSocket) => ({
  twilioSocket,
  openAiSocket: null,
  streamSid: null,
  companyId: null,
  callId: null,
  companyName: null,
  twilioCallSid: null,
  fromNumber: null,
  toNumber: null,
  voiceBookingEnabled: false,
  voiceAllowedActions: [],
  pendingAudio: [],
  handledFunctionCalls: new Set(),
  connectedAt: Date.now(),
  _openAiKeepAlive: null,
  _openAiConnectTimeout: null,
});

const clearTimers = (state) => {
  if (state._openAiKeepAlive) {
    clearInterval(state._openAiKeepAlive);
    state._openAiKeepAlive = null;
  }
  if (state._openAiConnectTimeout) {
    clearTimeout(state._openAiConnectTimeout);
    state._openAiConnectTimeout = null;
  }
};

const sendToTwilio = (state, payloadBase64) => {
  if (!state.streamSid) return;
  if (state.twilioSocket.readyState !== WebSocket.OPEN) return;
  state.twilioSocket.send(
    JSON.stringify({
      event: "media",
      streamSid: state.streamSid,
      media: { payload: payloadBase64 },
    }),
  );
};

const sendToOpenAi = (state, payload) => {
  const socket = state.openAiSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(payload));
  return true;
};

const logTurn = async ({ state, speaker, text }) => {
  if (!state.companyId || !state.callId) return;
  const normalizedText = (text || "").trim();
  if (!normalizedText) return;
  try {
    await callTool({
      companyId: state.companyId,
      callId: state.callId,
      tool: "log_turn",
      input: { speaker, text: normalizedText },
    });
  } catch (error) {
    process.stdout.write(
      `[voice-runtime] log_turn failed (${speaker}): ${
        error instanceof Error ? error.message : "unknown"
      }\n`,
    );
  }
};

const handleFunctionCall = async ({ state, name, callId, rawArguments }) => {
  if (!name || !callId) return;
  if (!state.companyId) return;
  if (state.handledFunctionCalls.has(callId)) return;

  state.handledFunctionCalls.add(callId);

  const input = typeof rawArguments === "string" ? safeJsonParse(rawArguments, {}) : {};
  const baseAllowed = ["search_knowledge", "create_callback"];
  const allowed = state.voiceBookingEnabled
    ? [...baseAllowed, "find_student", "verify_student_dob"]
    : baseAllowed;
  const tool = allowed.includes(name) ? name : null;
  if (!tool) {
    sendToOpenAi(state, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify({
          success: false,
          message: `Tool non supportato: ${name}`,
        }),
      },
    });
    sendToOpenAi(state, { type: "response.create" });
    return;
  }

  try {
    const result = await callTool({
      companyId: state.companyId,
      callId: state.callId || undefined,
      tool,
      input: input && typeof input === "object" ? input : {},
    });

    sendToOpenAi(state, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      },
    });
    sendToOpenAi(state, { type: "response.create" });
  } catch (error) {
    sendToOpenAi(state, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify({
          success: false,
          message: error instanceof Error ? error.message : "Tool call failed.",
        }),
      },
    });
    sendToOpenAi(state, { type: "response.create" });
  }
};

const setupOpenAiSocket = (state) => {
  if (!openAiApiKey) {
    throw new Error("OPENAI_API_KEY non configurata.");
  }
  if (!state.companyId || !state.callId) {
    throw new Error("companyId/callId mancanti nel Media Stream Twilio.");
  }

  const socket = new WebSocket(openAiRealtimeUrl, {
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });
  state.openAiSocket = socket;

  state._openAiConnectTimeout = setTimeout(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      process.stdout.write(
        `[voice-runtime] openai connection timeout after ${OPENAI_CONNECT_TIMEOUT_MS}ms\n`,
      );
      socket.terminate();
      if (state.twilioSocket.readyState === WebSocket.OPEN) {
        state.twilioSocket.close();
      }
    }
  }, OPENAI_CONNECT_TIMEOUT_MS);

  socket.on("open", async () => {
    clearTimeout(state._openAiConnectTimeout);
    state._openAiConnectTimeout = null;

    state._openAiKeepAlive = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.ping();
      }
    }, WS_KEEPALIVE_INTERVAL_MS);

    let customInstructions = "";
    try {
      const configResult = await callTool({
        companyId: state.companyId,
        tool: "get_config",
        input: {},
      });
      if (configResult.success && configResult.data?.voiceInstructions) {
        customInstructions = configResult.data.voiceInstructions;
      }
    } catch (error) {
      process.stdout.write(
        `[voice-runtime] get_config failed: ${
          error instanceof Error ? error.message : "unknown"
        }\n`,
      );
    }

    sendToOpenAi(state, {
      type: "session.update",
      session: {
        modalities: ["audio", "text"],
        voice: assistantVoice,
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        turn_detection: { type: "server_vad" },
        input_audio_transcription: { model: "whisper-1" },
        instructions: buildSessionInstructions(state, customInstructions),
        tools: buildRealtimeTools(state),
        tool_choice: "auto",
      },
    });

    for (const payload of state.pendingAudio) {
      sendToOpenAi(state, { type: "input_audio_buffer.append", audio: payload });
    }
    state.pendingAudio = [];

    sendToOpenAi(state, {
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: `Apri dicendo: "${normalizeCompanyName(
          state.companyName,
        )}, come posso aiutarti?"`,
      },
    });
  });

  socket.on("message", async (raw) => {
    const event = safeJsonParse(String(raw));
    if (!event || typeof event !== "object") return;

    if (event.type === "response.audio.delta" && typeof event.delta === "string") {
      sendToTwilio(state, event.delta);
      return;
    }

    if (
      event.type === "conversation.item.input_audio_transcription.completed" &&
      typeof event.transcript === "string"
    ) {
      await logTurn({ state, speaker: "caller", text: event.transcript });
      return;
    }

    if (event.type === "response.audio_transcript.done" && typeof event.transcript === "string") {
      await logTurn({ state, speaker: "assistant", text: event.transcript });
      return;
    }

    if (event.type === "response.function_call_arguments.done") {
      await handleFunctionCall({
        state,
        name: typeof event.name === "string" ? event.name : "",
        callId: typeof event.call_id === "string" ? event.call_id : "",
        rawArguments: typeof event.arguments === "string" ? event.arguments : "{}",
      });
      return;
    }

    if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
      await handleFunctionCall({
        state,
        name: typeof event.item.name === "string" ? event.item.name : "",
        callId: typeof event.item.call_id === "string" ? event.item.call_id : "",
        rawArguments:
          typeof event.item.arguments === "string" ? event.item.arguments : "{}",
      });
      return;
    }
  });

  socket.on("close", () => {
    clearTimers(state);
    state.openAiSocket = null;
    if (state.twilioSocket.readyState === WebSocket.OPEN) {
      state.twilioSocket.close();
    }
  });

  socket.on("error", (error) => {
    process.stdout.write(
      `[voice-runtime] openai socket error: ${
        error instanceof Error ? error.message : "unknown"
      }\n`,
    );
  });
};

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      ok: true,
      runtime: "voice",
      booking: "v1-stream",
      streamPath: "/twilio/stream",
    });
  }

  if (req.method === "POST" && req.url === "/tool/ping") {
    try {
      const data = await callTool({
        companyId: "00000000-0000-0000-0000-000000000000",
        tool: "ping",
      });
      return json(res, 200, data);
    } catch (error) {
      return json(res, 500, {
        success: false,
        message: error instanceof Error ? error.message : "Runtime ping failed.",
      });
    }
  }

  return json(res, 404, {
    success: false,
    message: "Not found.",
  });
});

const wsServer = new WebSocketServer({ noServer: true });

wsServer.on("connection", (socket) => {
  const state = createCallState(socket);

  const twilioKeepAlive = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.ping();
    }
  }, WS_KEEPALIVE_INTERVAL_MS);

  socket.on("message", (raw) => {
    const event = safeJsonParse(String(raw));
    if (!event || typeof event !== "object") return;

    if (event.event === "start") {
      state.streamSid = event.streamSid || event.start?.streamSid || null;
      state.twilioCallSid = event.start?.callSid || null;
      const params = event.start?.customParameters || {};
      state.companyId = typeof params.companyId === "string" ? params.companyId : null;
      state.companyName =
        typeof params.companyName === "string" ? normalizeCompanyName(params.companyName) : null;
      state.callId = typeof params.callId === "string" ? params.callId : null;
      state.fromNumber = typeof params.from === "string" ? params.from : null;
      state.toNumber = typeof params.to === "string" ? params.to : null;
      state.voiceBookingEnabled =
        params.voiceBookingEnabled === "1" || params.voiceBookingEnabled === "true";
      state.voiceAllowedActions =
        typeof params.voiceAllowedActions === "string"
          ? params.voiceAllowedActions
              .split(",")
              .map((entry) => entry.trim())
              .filter(Boolean)
          : [];

      try {
        setupOpenAiSocket(state);
      } catch (error) {
        process.stdout.write(
          `[voice-runtime] failed to setup openai socket: ${
            error instanceof Error ? error.message : "unknown"
          }\n`,
        );
        socket.close();
      }
      return;
    }

    if (event.event === "media") {
      const payload = event.media?.payload;
      if (typeof payload !== "string" || !payload) return;
      const forwarded = sendToOpenAi(state, {
        type: "input_audio_buffer.append",
        audio: payload,
      });
      if (!forwarded && state.pendingAudio.length < MAX_PENDING_AUDIO_CHUNKS) {
        state.pendingAudio.push(payload);
      }
      return;
    }

    if (event.event === "stop") {
      if (state.openAiSocket && state.openAiSocket.readyState === WebSocket.OPEN) {
        state.openAiSocket.close();
      }
      socket.close();
    }
  });

  socket.on("close", () => {
    clearInterval(twilioKeepAlive);
    clearTimers(state);
    if (state.openAiSocket && state.openAiSocket.readyState === WebSocket.OPEN) {
      state.openAiSocket.close();
    }
  });

  socket.on("error", (error) => {
    process.stdout.write(
      `[voice-runtime] twilio socket error: ${
        error instanceof Error ? error.message : "unknown"
      }\n`,
    );
  });
});

server.on("upgrade", (request, socket, head) => {
  const host = request.headers.host || "localhost";
  const { pathname } = new URL(request.url || "/", `http://${host}`);
  if (pathname !== "/twilio/stream") {
    socket.destroy();
    return;
  }

  wsServer.handleUpgrade(request, socket, head, (ws) => {
    wsServer.emit("connection", ws, request);
  });
});

server.listen(port, () => {
  process.stdout.write(`[voice-runtime] listening on :${port}\n`);
});
