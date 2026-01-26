"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";

const DocAiInputSchema = z.object({
  companyId: z.string(),
  templateId: z.string(),
  prompt: z.string().optional(),
  pages: z.array(
    z.object({
      page: z.number().int().min(1),
      lines: z.array(
        z.object({
          text: z.string(),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        }),
      ),
    }),
  ),
});

const DocAiOutputSchema = z.object({
  fields: z.array(
    z.object({
      type: z.enum(["input", "textarea", "sign", "text"]),
      page: z.number().int().min(1),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      bindingKey: z.string().nullable(),
      html: z.string().nullable(),
    }),
  ),
  warnings: z.array(z.string()).nullable(),
});

const MODEL_DEFAULT = process.env.OPENAI_MODEL || "gpt-5-mini";

type GenerateDocumentFieldsResult =
  | { success: false; message: string }
  | { success: true; data: z.infer<typeof DocAiOutputSchema> };

export async function generateDocumentFields(
  input: z.infer<typeof DocAiInputSchema>,
): Promise<GenerateDocumentFieldsResult> {
  try {
    const payload = DocAiInputSchema.parse(input);
    const session = await auth();
    const userId = session?.user?.id;

    if (!userId) {
      throw new Error("User is not authenticated");
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId, companyId: payload.companyId },
    });

    if (!membership) {
      throw new Error("User is not authorized for this company");
    }

    const template = await prisma.documentTemplate.findFirst({
      where: { id: payload.templateId, companyId: payload.companyId },
      select: { id: true },
    });

    if (!template) {
      throw new Error("Document not found");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is missing");
    }

    const prompt = payload.prompt?.trim() ?? "";
    const systemPrompt = [
      "You are Reglo AI for document templates.",
      "You receive PDF text lines with bounding boxes (x,y,width,height) normalized 0-1, origin top-left.",
      "Your job is to propose form fields to place on the document.",
      "Use only these field types: input, textarea, sign, text.",
      "If the user prompt is empty, do NOT generate text blocks (type=text).",
      "Place fields near their label lines (usually to the right, same y).",
      "Keep fields inside the page bounds; x,y,width,height must be between 0 and 1.",
      "Choose reasonable sizes: input is small, textarea is larger, sign is medium.",
      "Binding keys must be snake_case. If you are not confident, set bindingKey to null.",
      "If type is text, provide html (simple <p>..</p>).",
      "Return only JSON in the function call.",
    ].join(" ");

    const userPrompt = [
      prompt ? `User prompt: ${prompt}` : "User prompt: (empty)",
      "Context: lines are grouped per page with normalized bounding boxes.",
      `Pages: ${JSON.stringify(payload.pages)}`,
      "Return JSON: { fields: [ { type, page, x, y, width, height, bindingKey, html } ], warnings }",
    ].join("\n\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_DEFAULT,
        instructions: systemPrompt,
        input: userPrompt,
        max_output_tokens: 1400,
        reasoning: { effort: "low" },
        tools: [
          {
            type: "function",
            name: "build_document_fields",
            description: "Return document field placements for Reglo.",
            strict: true,
            parameters: {
              type: "object",
              additionalProperties: false,
              required: ["fields", "warnings"],
              properties: {
                fields: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "type",
                      "page",
                      "x",
                      "y",
                      "width",
                      "height",
                      "bindingKey",
                      "html",
                    ],
                    properties: {
                      type: {
                        type: "string",
                        enum: ["input", "textarea", "sign", "text"],
                      },
                      page: { type: "number" },
                      x: { type: "number" },
                      y: { type: "number" },
                      width: { type: "number" },
                      height: { type: "number" },
                      bindingKey: { type: ["string", "null"] },
                      html: { type: ["string", "null"] },
                    },
                  },
                },
                warnings: {
                  type: ["array", "null"],
                  items: { type: "string" },
                },
              },
            },
          },
        ],
        tool_choice: { type: "function", name: "build_document_fields" },
      }),
    });

    const payloadResponse = (await response.json()) as {
      output?: Array<{
        type?: string;
        name?: string;
        arguments?: string;
        function?: { name?: string; arguments?: string };
        content?: Array<{ type?: string; text?: string }>;
      }>;
      output_text?: string;
      status?: string;
      error?: { message?: string };
    };

    if (!response.ok || payloadResponse.error) {
      throw new Error(payloadResponse.error?.message || "OpenAI request failed");
    }

    const outputItems = payloadResponse.output ?? [];
    const functionCall =
      outputItems.find(
        (item) => item.type === "function_call" && item.name === "build_document_fields",
      ) ||
      outputItems.find(
        (item) =>
          item.type === "tool_call" &&
          (item.name === "build_document_fields" ||
            item.function?.name === "build_document_fields"),
      );

    const toolArgs = functionCall?.arguments ?? functionCall?.function?.arguments;
    if (!toolArgs) {
      throw new Error("AI response was empty");
    }

    const parsed = DocAiOutputSchema.safeParse(JSON.parse(toolArgs));
    if (!parsed.success) {
      throw new Error("AI response is not valid JSON for document fields");
    }

    return { success: true, data: parsed.data };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
