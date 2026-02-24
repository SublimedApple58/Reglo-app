import dotenv from "dotenv";
import { TextDecoder, TextEncoder } from "util";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.dev" });

if (!process.env.TZ) {
  process.env.TZ = "Europe/Rome";
}

if (typeof global.TextEncoder === "undefined") {
  // Required by Next.js internals in node test runtime.
  (global as typeof globalThis).TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
}

if (typeof global.TextDecoder === "undefined") {
  (global as typeof globalThis).TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}
