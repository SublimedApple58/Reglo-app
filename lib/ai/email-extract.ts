const DEFAULT_MODEL = process.env.OPENAI_EMAIL_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini";

type ExtractEmailFieldsInput = {
  schemaKeys: string[];
  subject?: string;
  text?: string;
  html?: string;
};

type ExtractEmailFieldsResult = {
  fields: Record<string, string>;
  warnings: string[];
};

const extractJsonFromText = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return trimmed;
  }
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match?.[0];
};

const guessNameFromText = (text: string) => {
  const patterns = [
    /il mio nome(?:\s+)?(?:è|e)\s+([A-ZÀ-ÖØ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+){0,3})/iu,
    /mi chiamo\s+([A-ZÀ-ÖØ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+){0,3})/iu,
    /\bsono\s+([A-ZÀ-ÖØ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+){0,3})/iu,
    /nome[:\s]+([A-ZÀ-ÖØ-Þ][\p{L}'’.-]+(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’.-]+){0,3})/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
};

const applyFallbacks = (keys: string[], text: string) => {
  const fallback: Record<string, string> = {};
  keys.forEach((key) => {
    const lower = key.toLowerCase();
    if (lower.includes("name") || lower.includes("nome")) {
      const guess = guessNameFromText(text);
      if (guess) {
        fallback[key] = guess;
      }
    }
  });
  return fallback;
};

export const extractEmailFields = async ({
  schemaKeys,
  subject,
  text,
  html,
}: ExtractEmailFieldsInput): Promise<ExtractEmailFieldsResult> => {
  if (!schemaKeys.length) {
    return { fields: {}, warnings: [] };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      fields: Object.fromEntries(schemaKeys.map((key) => [key, ""])),
      warnings: ["AI non disponibile: manca OPENAI_API_KEY."],
    };
  }

  const systemPrompt = [
    "You extract structured fields from inbound emails.",
    "Return ONLY JSON via the tool call.",
    "Use exactly the provided keys. Do not invent values.",
    "If a value is missing, set it to empty string.",
    "Keep the same language as the email content.",
    "Add warnings for missing or ambiguous values.",
  ].join(" ");

  const safeText = text ? text.slice(0, 4000) : "";
  const safeHtml = html ? html.slice(0, 4000) : "";
  const userPrompt = [
    `Keys: ${schemaKeys.join(", ")}`,
    `Subject: ${subject ?? ""}`,
    `Text: ${safeText}`,
    safeHtml ? `HTML: ${safeHtml}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      instructions: systemPrompt,
      input: userPrompt,
      max_output_tokens: 1200,
      reasoning: { effort: "low" },
      tools: [
        {
          type: "function",
          name: "extract_email_fields",
          description: "Return extracted fields for inbound email.",
          strict: true,
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["fields", "warnings"],
            properties: {
              fields: {
                type: "object",
                additionalProperties: false,
                required: schemaKeys,
                properties: Object.fromEntries(
                  schemaKeys.map((key) => [key, { type: "string" }]),
                ),
              },
              warnings: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      ],
      tool_choice: { type: "function", name: "extract_email_fields" },
      parallel_tool_calls: false,
    }),
  });

  const payload = (await response.json()) as {
    output?: Array<{
      type?: string;
      name?: string;
      arguments?: string;
      function?: { name?: string; arguments?: string };
      content?: Array<{ type?: string; text?: string }>;
    }>;
    output_text?: string;
    error?: { message?: string };
  };

  if (!response.ok || payload.error) {
    return {
      fields: Object.fromEntries(schemaKeys.map((key) => [key, ""])),
      warnings: [payload.error?.message || "Errore AI durante l'estrazione email."],
    };
  }

  const outputItems = payload.output ?? [];
  const functionCall =
    outputItems.find(
      (item) => item.type === "function_call" && item.name === "extract_email_fields",
    ) ||
    outputItems.find(
      (item) =>
        item.type === "tool_call" &&
        (item.name === "extract_email_fields" ||
          item.function?.name === "extract_email_fields"),
    );

  let jsonPayload = functionCall?.arguments ?? functionCall?.function?.arguments;

  if (!jsonPayload) {
    const messageItem = outputItems.find((item) => item.type === "message");
    const textContent = messageItem?.content?.find(
      (content) => content.type === "output_text",
    )?.text;
    if (textContent) {
      jsonPayload = extractJsonFromText(textContent);
    }
  }

  if (!jsonPayload && payload.output_text) {
    jsonPayload = extractJsonFromText(payload.output_text);
  }

  if (!jsonPayload) {
    const fallbackFields = applyFallbacks(schemaKeys, safeText);
    return {
      fields: Object.fromEntries(
        schemaKeys.map((key) => [key, fallbackFields[key] ?? ""]),
      ),
      warnings: ["Risposta AI vuota durante l'estrazione email."],
    };
  }

  try {
    const parsed = JSON.parse(jsonPayload) as {
      fields?: Record<string, string>;
      warnings?: string[];
    };
    const fallbackFields = applyFallbacks(schemaKeys, safeText);
    const fields: Record<string, string> = Object.fromEntries(
      schemaKeys.map((key) => [
        key,
        parsed.fields?.[key] ?? fallbackFields[key] ?? "",
      ]),
    );
    return {
      fields,
      warnings: parsed.warnings ?? [],
    };
  } catch (error) {
    const fallbackFields = applyFallbacks(schemaKeys, safeText);
    return {
      fields: Object.fromEntries(
        schemaKeys.map((key) => [key, fallbackFields[key] ?? ""]),
      ),
      warnings: ["Impossibile leggere la risposta AI per l'email."],
    };
  }
};
