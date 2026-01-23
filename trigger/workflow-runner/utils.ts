export const toJsonValue = (value: unknown) => {
  if (value === undefined) return null;
  if (value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
};

export const streamToBuffer = async (stream: unknown) => {
  if (!stream) return Buffer.from([]);
  if (stream instanceof Uint8Array) return Buffer.from(stream);
  if (typeof stream === "string") return Buffer.from(stream);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const htmlToText = (html: string) => {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const resolvePayloadValue = (payload: unknown, path?: string | null) => {
  if (!path || !payload || typeof payload !== "object") return "";
  const parts = path.split(".").filter(Boolean);
  let current: unknown = payload;
  for (const part of parts) {
    if (current == null) return "";
    if (Array.isArray(current)) {
      const index = Number(part);
      if (Number.isNaN(index)) return "";
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (current == null) return "";
  if (typeof current === "string") return current;
  if (typeof current === "number" || typeof current === "boolean") return String(current);
  try {
    return JSON.stringify(current);
  } catch {
    return String(current);
  }
};
