"use strict";

const http = require("http");
const crypto = require("crypto");

const port = Number(process.env.PORT || 8080);
const apiBaseUrl = (process.env.REGLO_API_BASE_URL || "").replace(/\/$/, "");
const sharedSecret = process.env.VOICE_RUNTIME_SHARED_SECRET || "";

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

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, {
      ok: true,
      runtime: "voice",
      booking: "v1-foundation",
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

server.listen(port, () => {
  process.stdout.write(`[voice-runtime] listening on :${port}\n`);
});
