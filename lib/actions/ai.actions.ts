"use server";

import { auth } from "@/auth";
import { prisma } from "@/db/prisma";
import { formatError } from "@/lib/utils";
import { z } from "zod";
import { aiTriggers, buildAiBlocks } from "@/lib/ai/workflow-catalog";
import type { AiWorkflowPreview } from "@/lib/ai/types";
import { providerEnumMap } from "@/lib/integrations/oauth";

const AiPreviewSchema = z.object({
  status: z.enum(["ok", "needs_clarification", "not_possible", "blocked"]),
  title: z.string().nullable(),
  summary: z.string().nullable(),
  message: z.string().nullable(),
  clarifying_questions: z.array(z.string()).nullable(),
  trigger: z
    .object({
      type: z.enum(["manual", "document_completed"]).nullable(),
      templateId: z.string().nullable(),
      manualFields: z
        .array(
          z.object({
            key: z.string(),
            required: z.boolean().nullable(),
          }),
        )
        .nullable(),
    })
    .nullable(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        blockId: z.string(),
        label: z.string().nullable(),
        config: z
          .array(
            z.object({
              key: z.string(),
              value: z.string().nullable(),
            }),
          )
          .nullable(),
      }),
    )
    .nullable(),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
      }),
    )
    .nullable(),
  warnings: z.array(z.string()).nullable(),
  missing_integrations: z.array(z.string()).nullable(),
  attach_to: z.string().nullable(),
  remove_nodes: z.array(z.string()).nullable(),
  override_trigger: z.boolean().nullable(),
});

const MODEL_DEFAULT = process.env.OPENAI_MODEL || "gpt-5-mini";

const pricePer1M: Record<string, { input: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5.2": { input: 1.75, output: 14.0 },
};

type GenerateWorkflowPreviewArgs = {
  prompt: string;
  answers?: Record<string, string>;
  existingNodes?: Array<{ id: string; label: string; blockId: string }>;
};

type GenerateWorkflowPreviewResult =
  | { success: false; message: string }
  | {
      success: true;
      data: AiWorkflowPreview;
      usage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number | null;
      };
    };

export async function generateWorkflowPreview({
  prompt,
  answers,
  existingNodes,
}: GenerateWorkflowPreviewArgs): Promise<GenerateWorkflowPreviewResult> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      throw new Error("User is not authenticated");
    }

    if (!prompt.trim()) {
      return { success: false, message: "Scrivi un prompt per l'AI." };
    }

    const membership = await prisma.companyMember.findFirst({
      where: { userId },
      include: { company: true },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      throw new Error("Company not found");
    }

    const connections = await prisma.integrationConnection.findMany({
      where: { companyId: membership.companyId, status: "connected" },
      select: { provider: true },
    });

    const slackConnected = connections.some(
      (conn) => conn.provider === providerEnumMap.slack,
    );
    const ficConnected = connections.some(
      (conn) => conn.provider === providerEnumMap["fatture-in-cloud"],
    );

    const templates = await prisma.documentTemplate.findMany({
      where: { companyId: membership.companyId },
      include: { fields: { select: { bindingKey: true } } },
      orderBy: { createdAt: "desc" },
    });

    const templatePayload = templates.map((template) => ({
      id: template.id,
      name: template.name,
      bindingKeys: Array.from(
        new Set(
          template.fields
            .map((field) => field.bindingKey)
            .filter((value): value is string => Boolean(value)),
        ),
      ),
    }));

    const availableBlocks = buildAiBlocks({ slackConnected, ficConnected });
    const context = {
      triggers: aiTriggers,
      blocks: availableBlocks.map((block) => ({
        id: block.id,
        label: block.label,
        integration: block.integration ?? null,
        fields: block.fields,
      })),
      templates: templatePayload,
      integrations: {
        slack: slackConnected ? "connected" : "not_connected",
        "fatture-in-cloud": ficConnected ? "connected" : "not_connected",
      },
      existing_nodes: existingNodes ?? [],
    };

    const clarifications =
      answers && Object.keys(answers).length
        ? Object.entries(answers)
            .map(([question, answer]) => `${question}: ${answer}`)
            .join("\n")
        : "";

    const systemPrompt = [
      "You are Reglo AI. Generate workflow previews strictly as JSON.",
      "Use ONLY the provided triggers and block ids.",
      "If the user asks for an unsupported service, return status=not_possible with a short message.",
      "If the service exists but is not connected, return status=blocked with missing_integrations.",
      "You can ask up to 2 clarification questions by returning status=needs_clarification and clarifying_questions.",
      "Prefer simple, linear flows.",
      "For dynamic values use tokens like {{trigger.payload.email}}.",
      "For node config use an array of {key, value} entries (value is string).",
      "If the user asks to remove existing blocks, return remove_nodes with the node ids.",
      "If the user asks to attach to a specific existing block, return attach_to with that node id.",
      "Only set override_trigger=true when the user explicitly asks to change the trigger. Otherwise set override_trigger=false.",
      "Return JSON only.",
    ].join(" ");

    const userPrompt = [
      `User request: ${prompt}`,
      clarifications ? `Clarifications:\n${clarifications}` : "",
      `Context: ${JSON.stringify(context)}`,
      "JSON shape: { status, title, summary, trigger, nodes, edges, warnings, missing_integrations, clarifying_questions, message, attach_to, remove_nodes, override_trigger }",
    ]
      .filter(Boolean)
      .join("\n\n");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is missing");
    }

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
        max_output_tokens: 1600,
        reasoning: { effort: "low" },
        tools: [
          {
            type: "function",
            name: "build_workflow_preview",
            description: "Return a workflow preview JSON for Reglo.",
            strict: true,
            parameters: {
              type: "object",
              additionalProperties: false,
              required: [
                "status",
                "title",
                "summary",
                "message",
                "clarifying_questions",
                "trigger",
                "nodes",
                "edges",
                "warnings",
                "missing_integrations",
                "attach_to",
                "remove_nodes",
                "override_trigger",
              ],
              properties: {
                status: {
                  type: "string",
                  enum: ["ok", "needs_clarification", "not_possible", "blocked"],
                },
                title: { type: ["string", "null"] },
                summary: { type: ["string", "null"] },
                message: { type: ["string", "null"] },
                clarifying_questions: {
                  type: ["array", "null"],
                  items: { type: "string" },
                  maxItems: 2,
                },
                trigger: {
                  type: ["object", "null"],
                  additionalProperties: false,
                  required: ["type", "templateId", "manualFields"],
                  properties: {
                    type: { type: ["string", "null"], enum: ["manual", "document_completed", null] },
                    templateId: { type: ["string", "null"] },
                    manualFields: {
                      type: ["array", "null"],
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["key", "required"],
                        properties: {
                          key: { type: "string" },
                          required: { type: ["boolean", "null"] },
                        },
                      },
                    },
                  },
                },
                nodes: {
                  type: ["array", "null"],
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "blockId", "label", "config"],
                    properties: {
                      id: { type: "string" },
                      blockId: { type: "string" },
                      label: { type: ["string", "null"] },
                      config: {
                        type: ["array", "null"],
                        items: {
                          type: "object",
                          additionalProperties: false,
                          required: ["key", "value"],
                          properties: {
                            key: { type: "string" },
                            value: { type: ["string", "null"] },
                          },
                        },
                      },
                    },
                  },
                },
                edges: {
                  type: ["array", "null"],
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["from", "to"],
                    properties: {
                      from: { type: "string" },
                      to: { type: "string" },
                    },
                  },
                },
                warnings: { type: ["array", "null"], items: { type: "string" } },
                missing_integrations: { type: ["array", "null"], items: { type: "string" } },
                attach_to: { type: ["string", "null"] },
                remove_nodes: { type: ["array", "null"], items: { type: "string" } },
                override_trigger: { type: ["boolean", "null"] },
              },
            },
          },
        ],
        tool_choice: { type: "function", name: "build_workflow_preview" },
        parallel_tool_calls: false,
        prompt_cache_key: String(membership.companyId),
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
      status?: string;
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
      error?: { message?: string };
    };

    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message || "OpenAI request failed");
    }

    const outputItems = payload.output ?? [];
    const functionCall =
      outputItems.find(
        (item) => item.type === "function_call" && item.name === "build_workflow_preview",
      ) ||
      outputItems.find(
        (item) =>
          item.type === "tool_call" &&
          (item.name === "build_workflow_preview" ||
            item.function?.name === "build_workflow_preview"),
      );

    const toolArgs = functionCall?.arguments ?? functionCall?.function?.arguments;

    const extractJsonFromText = (text: string) => {
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return trimmed;
      }
      const match = trimmed.match(/\{[\s\S]*\}/);
      return match?.[0];
    };

    let jsonPayload: string | undefined = toolArgs;
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
      const outputTypes = outputItems.map((item) => item.type).filter(Boolean).join(", ");
      console.error("AI response missing function call", {
        status: payload.status,
        outputTypes,
        outputCount: outputItems.length,
        hasOutputText: Boolean(payload.output_text),
      });
      console.error("AI response payload", payload);
      throw new Error("AI response was empty");
    }

    const parsed = AiPreviewSchema.safeParse(JSON.parse(jsonPayload));
    if (!parsed.success) {
      throw new Error("AI response is not valid JSON for preview");
    }

    const normalizedNodes = parsed.data.nodes?.map((node) => {
      const configEntries = node.config ?? [];
      const config =
        Array.isArray(configEntries) && configEntries.length > 0
          ? Object.fromEntries(
              configEntries.map((entry) => [entry.key, entry.value ?? ""]),
            )
          : undefined;
      return {
        id: node.id,
        blockId: node.blockId,
        label: node.label ?? undefined,
        config,
      };
    });

    const preview: AiWorkflowPreview = {
      status: parsed.data.status,
      title: parsed.data.title ?? undefined,
      summary: parsed.data.summary ?? undefined,
      message: parsed.data.message ?? undefined,
      trigger: parsed.data.trigger ?? undefined,
      nodes: normalizedNodes ?? undefined,
      edges: parsed.data.edges ?? undefined,
      warnings: parsed.data.warnings ?? undefined,
      missingIntegrations: parsed.data.missing_integrations ?? undefined,
      clarifyingQuestions: parsed.data.clarifying_questions ?? undefined,
      attachTo: parsed.data.attach_to ?? undefined,
      removeNodes: parsed.data.remove_nodes ?? undefined,
      overrideTrigger: parsed.data.override_trigger ?? undefined,
    };

    const allowedBlockIds = new Set(availableBlocks.map((block) => block.id));
    const knownBlocks = buildAiBlocks({ slackConnected: true, ficConnected: true });
    const knownBlockMap = new Map(knownBlocks.map((block) => [block.id, block]));
    const invalidBlocks = preview.nodes
      ?.map((node) => node.blockId)
      .filter((blockId) => !allowedBlockIds.has(blockId));
    if (invalidBlocks && invalidBlocks.length > 0) {
      const blocked = invalidBlocks.filter((blockId) => knownBlockMap.has(blockId));
      if (blocked.length > 0) {
        const missingIntegrations = Array.from(
          new Set(
            blocked
              .map((blockId) => knownBlockMap.get(blockId)?.integration)
              .filter((integration): integration is "slack" | "fatture-in-cloud" =>
                Boolean(integration),
              ),
          ),
        );
        return {
          success: true,
          data: {
            status: "blocked",
            message: "Serve connettere servizi esterni per applicare il workflow.",
            missingIntegrations,
            warnings: [
              `Blocchi bloccati: ${Array.from(new Set(blocked)).join(", ")}`,
            ],
            attachTo: undefined,
            removeNodes: undefined,
            overrideTrigger: false,
          },
        };
      }
      return {
        success: true,
        data: {
          status: "not_possible",
          message: "Il workflow include blocchi non supportati da Reglo.",
          warnings: [`Blocchi non validi: ${Array.from(new Set(invalidBlocks)).join(", ")}`],
          attachTo: undefined,
          removeNodes: undefined,
          overrideTrigger: false,
        },
      };
    }

    const usage = payload.usage ?? {};
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;
    const price = pricePer1M[MODEL_DEFAULT];
    const estimatedCostUsd = price
      ? (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output
      : null;

    return {
      success: true,
      data: preview,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCostUsd,
        model: MODEL_DEFAULT,
      },
    };
  } catch (error) {
    return { success: false, message: formatError(error) };
  }
}
