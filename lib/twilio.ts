import Twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.warn("[twilio] TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set");
}

let _client: ReturnType<typeof Twilio> | null = null;

export function getTwilioClient() {
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  if (!_client) {
    _client = Twilio(accountSid, authToken);
  }
  return _client;
}

export const VOICE_WEBHOOK_BASE_URL =
  process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "") || "https://app.reglo.it";
