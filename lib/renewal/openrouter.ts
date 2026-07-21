import "server-only";

/**
 * Rinnovo Patenti — OpenRouter client.
 *
 * Thin `fetch` wrapper (same spirit as lib/telnyx.ts) over OpenRouter's
 * OpenAI-compatible Chat Completions API. Used by the citizen-facing chatbot for
 * conversation, tool-calling (collect data, list slots, book) and a light vision
 * soft-check of uploaded documents.
 *
 * Env:
 *   OPENROUTER_API_KEY  — required to run the chatbot.
 *   OPENROUTER_MODEL    — model slug (default a vision-capable model). Set to a
 *                         Claude slug (e.g. "anthropic/claude-sonnet-4.5") to
 *                         route through Anthropic.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const getRenewalModel = () =>
  process.env.OPENROUTER_MODEL?.trim() || "openai/gpt-4o-mini";

export type ChatTextPart = { type: "text"; text: string };
export type ChatImagePart = { type: "image_url"; image_url: { url: string } };
export type ChatContentPart = ChatTextPart | ChatImagePart;

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatContentPart[] | null;
  /** assistant tool call requests */
  tool_calls?: ToolCall[];
  /** for role:"tool" — which call this answers */
  tool_call_id?: string;
  name?: string;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatCompletionResult = {
  message: ChatMessage;
  finishReason: string | null;
};

export class OpenRouterError extends Error {}

export async function renewalChatCompletion(params: {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none";
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<ChatCompletionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError("OPENROUTER_API_KEY is not configured");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter attribution headers (optional but recommended).
      "HTTP-Referer": process.env.NEXT_PUBLIC_SERVER_URL ?? "https://app.reglo.it",
      "X-Title": "Reglo — Rinnovo Patenti",
    },
    body: JSON.stringify({
      model: getRenewalModel(),
      messages: params.messages,
      tools: params.tools,
      tool_choice: params.tools ? params.toolChoice ?? "auto" : undefined,
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens ?? 800,
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OpenRouterError(
      `OpenRouter request failed (${res.status}): ${text.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: ChatMessage; finish_reason?: string }>;
  };
  const choice = json.choices?.[0];
  if (!choice?.message) {
    throw new OpenRouterError("OpenRouter returned no message");
  }
  return {
    message: choice.message,
    finishReason: choice.finish_reason ?? null,
  };
}
