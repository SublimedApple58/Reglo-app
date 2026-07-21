import "server-only";

import { z } from "zod";
import { prisma } from "@/db/prisma";
import {
  renewalChatCompletion,
  type ChatMessage,
  type ChatContentPart,
  type ToolDefinition,
} from "@/lib/renewal/openrouter";
import { getBookableSlots, createRenewalBooking } from "@/lib/renewal/booking";
import {
  requiredDocumentTypes,
  RENEWAL_DOCUMENT_LABELS,
} from "@/lib/renewal/constants";
import { sendRenewalBookingEmails } from "@/lib/renewal/notifications";

/**
 * Rinnovo Patenti — chatbot orchestration.
 * The bot is the citizen's primary interface: it collects identity data (tool),
 * guides document upload (handled by the UI), answers FAQs from the company's
 * `faqs` table, then lists slots and books the visit (tools). Constrained by a
 * strict Italian system prompt to avoid normative hallucinations.
 */

const MAX_TOOL_ITERATIONS = 4;

const citizenDetailsSchema = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().email().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  codiceFiscale: z.string().trim().max(16).optional(),
  licenseNumber: z.string().trim().max(40).optional(),
  licenseExpiresAt: z.string().trim().optional(), // YYYY-MM-DD
  birthDate: z.string().trim().optional(), // YYYY-MM-DD
});

const parseDateOnly = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const tools: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "save_citizen_details",
      description:
        "Salva i dati anagrafici del cittadino man mano che li fornisce. Chiama questa funzione ogni volta che ottieni uno o più dati nuovi. Passa solo i campi che conosci.",
      parameters: {
        type: "object",
        properties: {
          firstName: { type: "string", description: "Nome" },
          lastName: { type: "string", description: "Cognome" },
          email: { type: "string", description: "Email di contatto" },
          phone: { type: "string", description: "Numero di telefono" },
          codiceFiscale: { type: "string", description: "Codice fiscale" },
          licenseNumber: { type: "string", description: "Numero della patente" },
          licenseExpiresAt: {
            type: "string",
            description: "Scadenza patente attuale in formato YYYY-MM-DD",
          },
          birthDate: { type: "string", description: "Data di nascita in formato YYYY-MM-DD" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_available_slots",
      description:
        "Elenca gli slot disponibili per la visita medica. Usala quando il cittadino è pronto a prenotare. Restituisce id e descrizione leggibile di ogni slot.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "book_visit",
      description:
        "Prenota lo slot scelto dal cittadino. Passa l'id esatto di uno slot ottenuto da list_available_slots.",
      parameters: {
        type: "object",
        properties: { slotId: { type: "string", description: "id dello slot" } },
        required: ["slotId"],
      },
    },
  },
];

type RequestState = {
  id: string;
  companyId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  codiceFiscale: string | null;
  licenseNumber: string | null;
  licenseExpiresAt: Date | null;
  birthDate: Date | null;
  documentTypes: string[];
  hasBooking: boolean;
};

async function loadState(requestId: string): Promise<RequestState | null> {
  const req = await prisma.renewalRequest.findUnique({
    where: { id: requestId },
    include: {
      documents: { select: { type: true } },
      booking: { select: { id: true } },
    },
  });
  if (!req) return null;
  return {
    id: req.id,
    companyId: req.companyId,
    firstName: req.firstName,
    lastName: req.lastName,
    email: req.email,
    phone: req.phone,
    codiceFiscale: req.codiceFiscale,
    licenseNumber: req.licenseNumber,
    licenseExpiresAt: req.licenseExpiresAt,
    birthDate: req.birthDate,
    documentTypes: Array.from(new Set(req.documents.map((d) => d.type))),
    hasBooking: Boolean(req.booking),
  };
}

function buildSystemPrompt(params: {
  companyName: string;
  faqs: { question: string; answer: string }[];
  state: RequestState;
  anamnesticRequired: boolean;
}): string {
  const { companyName, faqs, state, anamnesticRequired } = params;
  const required = requiredDocumentTypes(anamnesticRequired);
  const missingDocs = required
    .filter((t) => !state.documentTypes.includes(t))
    .map((t) => RENEWAL_DOCUMENT_LABELS[t]);
  const knownData = [
    state.firstName && `nome: ${state.firstName}`,
    state.lastName && `cognome: ${state.lastName}`,
    state.email && `email: ${state.email}`,
    state.phone && `telefono: ${state.phone}`,
    state.codiceFiscale && `codice fiscale: ${state.codiceFiscale}`,
    state.licenseNumber && `numero patente: ${state.licenseNumber}`,
  ]
    .filter(Boolean)
    .join(", ");

  const faqBlock = faqs.length
    ? faqs.map((f, i) => `${i + 1}. D: ${f.question}\n   R: ${f.answer}`).join("\n")
    : "(nessuna FAQ configurata)";

  return [
    `Sei l'assistente virtuale di "${companyName}" e aiuti i cittadini a rinnovare la patente di guida.`,
    "",
    "OBIETTIVO: guidare il cittadino a (1) caricare i documenti, (2) fornire i dati anagrafici, (3) prenotare la visita medica.",
    "",
    "DOCUMENTI DA CARICARE (tramite il pulsante di caricamento nell'interfaccia, non chiederli via testo):",
    ...required.map((t) => `- ${RENEWAL_DOCUMENT_LABELS[t]}`),
    anamnesticRequired
      ? "Il certificato anamnestico lo rilascia il medico curante (medico di famiglia) ed è obbligatorio per questa autoscuola."
      : "",
    "Il certificato di idoneità NON va caricato: lo rilascia il medico durante la visita.",
    missingDocs.length
      ? `Documenti ancora mancanti: ${missingDocs.join(", ")}.`
      : "Tutti i documenti obbligatori sono stati caricati.",
    "",
    "DATI ANAGRAFICI da raccogliere e salvare con save_citizen_details: nome, cognome, email, telefono, codice fiscale, numero patente, scadenza patente, data di nascita.",
    knownData ? `Dati già noti: ${knownData}.` : "Nessun dato anagrafico ancora raccolto.",
    "",
    "PRENOTAZIONE: quando documenti e dati principali ci sono, usa list_available_slots per mostrare gli orari e book_visit per prenotare lo slot scelto. La visita è confermata subito; il pagamento si salda in sede.",
    state.hasBooking ? "La visita è GIÀ prenotata: non riprenotare, conferma solo i dettagli." : "",
    "",
    "QUANDO L'UTENTE CARICA UN'IMMAGINE: fai un controllo leggero e NON vincolante (sembra il documento giusto? la foto è leggibile?). Chiarisci sempre che la validazione finale spetta all'autoscuola.",
    "",
    "REGOLE:",
    "- Rispondi in italiano, tono cortese e conciso.",
    "- Per domande su costi/tempi/requisiti usa SOLO le FAQ qui sotto. Se la risposta non c'è, dì che verificherà l'autoscuola e invita a contattarla. Non inventare informazioni normative.",
    "- Resta sul tema del rinnovo patente. Per altri argomenti, rimanda all'autoscuola.",
    "",
    "FAQ configurate dall'autoscuola:",
    faqBlock,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  state: RequestState,
): Promise<{ result: string; sideEffect?: "booked" }> {
  if (name === "save_citizen_details") {
    const parsed = citizenDetailsSchema.safeParse(args);
    if (!parsed.success) return { result: JSON.stringify({ ok: false, error: "invalid_args" }) };
    const data = parsed.data;
    const licenseExpiresAt = parseDateOnly(data.licenseExpiresAt);
    const birthDate = parseDateOnly(data.birthDate);
    await prisma.renewalRequest.update({
      where: { id: state.id },
      data: {
        ...(data.firstName ? { firstName: data.firstName } : {}),
        ...(data.lastName ? { lastName: data.lastName } : {}),
        ...(data.email ? { email: data.email } : {}),
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.codiceFiscale ? { codiceFiscale: data.codiceFiscale.toUpperCase() } : {}),
        ...(data.licenseNumber ? { licenseNumber: data.licenseNumber } : {}),
        ...(licenseExpiresAt ? { licenseExpiresAt } : {}),
        ...(birthDate ? { birthDate } : {}),
      },
    });
    return { result: JSON.stringify({ ok: true }) };
  }

  if (name === "list_available_slots") {
    const slots = await getBookableSlots(state.companyId, { limit: 8 });
    return {
      result: JSON.stringify({
        ok: true,
        slots: slots.map((s) => ({ id: s.id, label: s.label })),
      }),
    };
  }

  if (name === "book_visit") {
    const slotId = typeof args.slotId === "string" ? args.slotId : "";
    if (!slotId) return { result: JSON.stringify({ ok: false, error: "missing_slot" }) };
    const result = await createRenewalBooking({
      companyId: state.companyId,
      requestId: state.id,
      slotId,
    });
    if (!result.ok) {
      return { result: JSON.stringify({ ok: false, error: result.reason }) };
    }
    // Fire confirmation + admin alert emails off the response path.
    await sendRenewalBookingEmails(state.id).catch((err) =>
      console.error("[renewal] booking emails failed", err),
    );
    return {
      result: JSON.stringify({
        ok: true,
        startAt: result.startAt,
        medico: result.medicoName,
      }),
      sideEffect: "booked",
    };
  }

  return { result: JSON.stringify({ ok: false, error: "unknown_tool" }) };
}

export type RenewalChatResult = {
  reply: string;
  booked: boolean;
};

/**
 * Run a single chat turn: append the citizen message (with optional images for a
 * vision soft-check), resolve any tool calls, persist the transcript, and return
 * the assistant reply.
 */
export async function runRenewalChatTurn(input: {
  companyId: string;
  companyName: string;
  requestId: string;
  userText: string;
  imageDataUrls?: string[];
  anamnesticRequired?: boolean;
}): Promise<RenewalChatResult> {
  const state = await loadState(input.requestId);
  if (!state || state.companyId !== input.companyId) {
    throw new Error("REQUEST_NOT_FOUND");
  }

  const [faqs, history] = await Promise.all([
    prisma.renewalFaq.findMany({
      where: { companyId: input.companyId, active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { question: true, answer: true },
      take: 50,
    }),
    prisma.renewalChatMessage.findMany({
      where: { requestId: input.requestId, role: { in: ["user", "assistant"] } },
      orderBy: { createdAt: "asc" },
      take: 40,
      select: { role: true, content: true },
    }),
  ]);

  const systemPrompt = buildSystemPrompt({
    companyName: input.companyName,
    faqs,
    state,
    anamnesticRequired: Boolean(input.anamnesticRequired),
  });

  const userContent: string | ChatContentPart[] = input.imageDataUrls?.length
    ? [
        { type: "text", text: input.userText || "(documento caricato)" },
        ...input.imageDataUrls.map(
          (url): ChatContentPart => ({ type: "image_url", image_url: { url } }),
        ),
      ]
    : input.userText;

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: userContent },
  ];

  let booked = false;
  let assistantText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const { message } = await renewalChatCompletion({ messages, tools });
    messages.push(message);

    if (message.tool_calls?.length) {
      for (const call of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }
        const { result, sideEffect } = await executeTool(call.function.name, args, state);
        if (sideEffect === "booked") booked = true;
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue; // let the model react to tool results
    }

    assistantText = typeof message.content === "string" ? message.content : "";
    break;
  }

  if (!assistantText) {
    assistantText =
      "Scusa, non sono riuscito a completare la richiesta. Puoi riprovare o contattare l'autoscuola.";
  }

  // Persist the transcript (citizen text + assistant final reply). Images are
  // not stored inline to keep the transcript light.
  await prisma.renewalChatMessage.createMany({
    data: [
      {
        requestId: input.requestId,
        role: "user",
        content: input.imageDataUrls?.length
          ? `${input.userText || "(documento caricato)"} [allegato immagine]`
          : input.userText,
      },
      { requestId: input.requestId, role: "assistant", content: assistantText },
    ],
  });

  return { reply: assistantText, booked };
}
