import crypto from "crypto";
import { prisma as defaultPrisma } from "@/db/prisma";
import { getAutoscuolaSettingsForCompany } from "@/lib/actions/autoscuole-settings.actions";

type PrismaClientLike = typeof defaultPrisma;

export const VOICE_ALLOWED_ACTIONS = ["faq", "lesson_info", "booking"] as const;
export type VoiceAllowedAction = (typeof VOICE_ALLOWED_ACTIONS)[number];

export type AutoscuolaVoiceSettings = {
  voiceFeatureEnabled: boolean;
  voiceProvisioningStatus: "not_started" | "provisioning" | "ready" | "error";
  voiceLineRef: string | null;
  voiceAssistantEnabled: boolean;
  voiceBookingEnabled: boolean;
  voiceLanguage: "it-IT";
  voiceLegalGreetingEnabled: boolean;
  voiceOfficeHours: {
    daysOfWeek: number[];
    startMinutes: number;
    endMinutes: number;
  } | null;
  voiceHandoffPhone: string | null;
  voiceFallbackMode: "transfer_or_callback";
  voiceRecordingEnabled: boolean;
  voiceTranscriptionEnabled: boolean;
  voiceRetentionDays: 90;
  voiceInstructions: string;
  voiceAllowedActions: VoiceAllowedAction[];
};

type VoiceLineContext = {
  line: {
    id: string;
    companyId: string;
    displayNumber: string;
    twilioNumber: string;
    twilioPhoneSid: string;
    status: string;
    routingMode: string;
  };
  companyId: string;
  settings: AutoscuolaVoiceSettings;
};

const DEFAULT_RETENTION_DAYS = 90;

const normalizeString = (value: string | null | undefined) => (value ?? "").trim();

const normalizePhone = (value: string | null | undefined) => {
  const raw = normalizeString(value);
  if (!raw) return "";
  const cleaned = raw.replace(/[^+\d]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) {
    return `+${cleaned.slice(1).replace(/\+/g, "")}`;
  }
  return cleaned;
};

const phoneDigits = (value: string | null | undefined) =>
  normalizePhone(value).replace(/\D/g, "");

const toPhoneCandidates = (value: string | null | undefined) => {
  const normalized = normalizePhone(value);
  const digits = phoneDigits(value);
  const candidates = new Set<string>();
  if (normalized) {
    candidates.add(normalized);
  }
  if (digits) {
    candidates.add(digits);
    candidates.add(`+${digits}`);
  }
  if (digits.length > 10) {
    const tail10 = digits.slice(-10);
    candidates.add(tail10);
    candidates.add(`+${tail10}`);
    candidates.add(`+39${tail10}`);
    candidates.add(`39${tail10}`);
  }
  return Array.from(candidates);
};

const phonesMatch = (a: string | null | undefined, b: string | null | undefined) => {
  const aCandidates = toPhoneCandidates(a);
  const bCandidates = new Set(toPhoneCandidates(b));
  return aCandidates.some((candidate) => bCandidates.has(candidate));
};

const parseDate = (value: string | null | undefined) => {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const ymd = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }

  const dmy = normalized.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  if (dmy) {
    return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const year = parsed.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

const extractDobFromUser = (address: unknown) => {
  if (!address || typeof address !== "object") return null;
  const payload = address as Record<string, unknown>;
  const rawValue =
    payload.birthDate ??
    payload.dateOfBirth ??
    payload.dob ??
    payload["dataNascita"] ??
    payload["data_di_nascita"];

  if (typeof rawValue !== "string") return null;
  return parseDate(rawValue);
};

const mapVoiceSettings = async (companyId: string): Promise<AutoscuolaVoiceSettings> => {
  const settings = await getAutoscuolaSettingsForCompany(companyId);
  return {
    voiceFeatureEnabled: Boolean(settings.voiceFeatureEnabled),
    voiceProvisioningStatus: settings.voiceProvisioningStatus,
    voiceLineRef: settings.voiceLineRef,
    voiceAssistantEnabled: Boolean(settings.voiceAssistantEnabled),
    voiceBookingEnabled: Boolean(settings.voiceBookingEnabled),
    voiceLanguage: "it-IT",
    voiceLegalGreetingEnabled: settings.voiceLegalGreetingEnabled !== false,
    voiceOfficeHours: settings.voiceOfficeHours,
    voiceHandoffPhone: settings.voiceHandoffPhone,
    voiceFallbackMode: settings.voiceFallbackMode,
    voiceRecordingEnabled: settings.voiceRecordingEnabled !== false,
    voiceTranscriptionEnabled: settings.voiceTranscriptionEnabled !== false,
    voiceRetentionDays: settings.voiceRetentionDays ?? 90,
    voiceInstructions: settings.voiceInstructions ?? "",
    voiceAllowedActions: (settings.voiceAllowedActions?.filter(
      (item): item is VoiceAllowedAction =>
        VOICE_ALLOWED_ACTIONS.includes(item as VoiceAllowedAction),
    ) ?? ["faq", "lesson_info"]) as VoiceAllowedAction[],
  };
};

export async function resolveVoiceLineContextByNumber(
  incomingTo: string | null | undefined,
  prisma: PrismaClientLike = defaultPrisma,
): Promise<VoiceLineContext | null> {
  const candidates = toPhoneCandidates(incomingTo);
  if (!candidates.length) return null;

  const lines = await prisma.autoscuolaVoiceLine.findMany({
    where: {
      status: { not: "inactive" },
      OR: [
        { twilioNumber: { in: candidates } },
        { displayNumber: { in: candidates } },
      ],
    },
    select: {
      id: true,
      companyId: true,
      displayNumber: true,
      twilioNumber: true,
      twilioPhoneSid: true,
      status: true,
      routingMode: true,
    },
    take: 1,
  });
  const line = lines[0];
  if (!line) return null;

  const settings = await mapVoiceSettings(line.companyId);
  return {
    line,
    companyId: line.companyId,
    settings,
  };
}

const normalizeTwilioUrlVariants = (inputUrl: string) => {
  const variants = new Set<string>([inputUrl]);
  try {
    const parsed = new URL(inputUrl);
    const trimmedPath = parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;
    const slashPath = trimmedPath ? `${trimmedPath}/` : "/";

    const protocols: Array<"http:" | "https:"> = ["https:", "http:"];
    for (const protocol of protocols) {
      const base = `${protocol}//${parsed.host}`;
      variants.add(`${base}${trimmedPath}${parsed.search}`);
      variants.add(`${base}${trimmedPath}`);
      variants.add(`${base}${slashPath}${parsed.search}`);
      variants.add(`${base}${slashPath}`);
    }
  } catch {
    // Keep original URL only.
  }
  return Array.from(variants);
};

const buildTwilioValidationUrlCandidates = (requestUrl: string) => {
  const candidates = new Set<string>(normalizeTwilioUrlVariants(requestUrl));
  const base = normalizeString(process.env.TWILIO_WEBHOOK_BASE_URL);
  if (base) {
    try {
      const parsed = new URL(requestUrl);
      const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
      const withPath = `${normalizedBase}${parsed.pathname}`;
      const withPathAndSearch = `${withPath}${parsed.search}`;
      for (const variant of normalizeTwilioUrlVariants(withPathAndSearch)) {
        candidates.add(variant);
      }
      for (const variant of normalizeTwilioUrlVariants(withPath)) {
        candidates.add(variant);
      }
    } catch {
      for (const variant of normalizeTwilioUrlVariants(base)) {
        candidates.add(variant);
      }
    }
  }
  return Array.from(candidates);
};

export function verifyTwilioRequestSignature({
  requestUrl,
  payload,
  signature,
}: {
  requestUrl: string;
  payload: Record<string, string>;
  signature: string | null;
}) {
  const authToken = normalizeString(process.env.TWILIO_AUTH_TOKEN);
  if (!authToken) return true;
  if (!signature) return false;

  const sortedPayload = Object.keys(payload)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}${payload[key] ?? ""}`)
    .join("");

  const candidates = buildTwilioValidationUrlCandidates(requestUrl);
  for (const candidate of candidates) {
    const digest = crypto
      .createHmac("sha1", authToken)
      .update(candidate + sortedPayload)
      .digest("base64");
    try {
      if (
        crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
      ) {
        return true;
      }
    } catch {
      // Ignore invalid signature length mismatch and continue.
    }
  }
  return false;
}

const findCompanyStudentByPhone = async ({
  prisma,
  companyId,
  phone,
}: {
  prisma: PrismaClientLike;
  companyId: string;
  phone: string | null | undefined;
}) => {
  const members = await prisma.companyMember.findMany({
    where: {
      companyId,
      autoscuolaRole: "STUDENT",
    },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
        },
      },
    },
  });
  const user = members.map((member) => member.user).find((candidate) =>
    phonesMatch(candidate.phone, phone),
  );
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    dob: extractDobFromUser(user.address),
  };
};

export async function upsertIncomingVoiceCall({
  companyId,
  lineId,
  twilioCallSid,
  fromNumber,
  toNumber,
  status,
  prisma = defaultPrisma,
}: {
  companyId: string;
  lineId: string;
  twilioCallSid: string;
  fromNumber: string;
  toNumber: string;
  status?: string;
  prisma?: PrismaClientLike;
}) {
  const student = await findCompanyStudentByPhone({
    prisma,
    companyId,
    phone: fromNumber,
  });

  return prisma.autoscuolaVoiceCall.upsert({
    where: { twilioCallSid },
    update: {
      fromNumber: normalizePhone(fromNumber) || fromNumber,
      toNumber: normalizePhone(toNumber) || toNumber,
      status: normalizeString(status) || "received",
      studentId: student?.id ?? null,
    },
    create: {
      companyId,
      lineId,
      twilioCallSid,
      fromNumber: normalizePhone(fromNumber) || fromNumber,
      toNumber: normalizePhone(toNumber) || toNumber,
      status: normalizeString(status) || "received",
      studentId: student?.id ?? null,
      startedAt: new Date(),
    },
    select: {
      id: true,
      companyId: true,
      lineId: true,
      studentId: true,
      fromNumber: true,
      toNumber: true,
      status: true,
    },
  });
}

export async function updateVoiceCallStatusFromTwilio({
  twilioCallSid,
  status,
  durationSec,
  endedAt,
  outcome,
  summary,
  prisma = defaultPrisma,
}: {
  twilioCallSid: string;
  status: string;
  durationSec?: number | null;
  endedAt?: Date | null;
  outcome?: string | null;
  summary?: string | null;
  prisma?: PrismaClientLike;
}) {
  const normalizedStatus = normalizeString(status) || "updated";
  const closedStatuses = new Set([
    "completed",
    "busy",
    "failed",
    "no-answer",
    "canceled",
    "cancelled",
  ]);
  const shouldClose = closedStatuses.has(normalizedStatus.toLowerCase());

  const updateResult = await prisma.autoscuolaVoiceCall.updateMany({
    where: { twilioCallSid },
    data: {
      status: normalizedStatus,
      durationSec: durationSec ?? undefined,
      endedAt: shouldClose ? (endedAt ?? new Date()) : undefined,
      outcome: outcome ?? undefined,
      summary: summary ?? undefined,
    },
  });
  return updateResult.count > 0;
}

export async function updateVoiceCallRecordingFromTwilio({
  twilioCallSid,
  recordingSid,
  recordingUrl,
  prisma = defaultPrisma,
}: {
  twilioCallSid: string;
  recordingSid: string;
  recordingUrl: string | null;
  prisma?: PrismaClientLike;
}) {
  const updateResult = await prisma.autoscuolaVoiceCall.updateMany({
    where: { twilioCallSid },
    data: {
      recordingSid,
      recordingUrl: recordingUrl ?? null,
    },
  });
  return updateResult.count > 0;
}

export async function appendVoiceCallTurn({
  callId,
  speaker,
  text,
  confidence,
  prisma = defaultPrisma,
}: {
  callId: string;
  speaker: string;
  text: string;
  confidence?: number | null;
  prisma?: PrismaClientLike;
}) {
  const normalizedSpeaker = normalizeString(speaker) || "assistant";
  return prisma.$transaction(async (tx) => {
    const turn = await tx.autoscuolaVoiceCallTurn.create({
      data: {
        callId,
        speaker: normalizedSpeaker,
        text,
        confidence: typeof confidence === "number" ? confidence : null,
      },
      select: {
        id: true,
        callId: true,
        speaker: true,
        text: true,
        confidence: true,
        createdAt: true,
      },
    });

    const current = await tx.autoscuolaVoiceCall.findUnique({
      where: { id: callId },
      select: { transcriptText: true },
    });
    const line = `[${normalizedSpeaker}] ${text}`.trim();
    const transcriptText = current?.transcriptText
      ? `${current.transcriptText}\n${line}`
      : line;
    await tx.autoscuolaVoiceCall.update({
      where: { id: callId },
      data: { transcriptText },
    });
    return turn;
  });
}

export async function createVoiceCallbackTask({
  companyId,
  callId,
  phoneNumber,
  reason,
  studentId,
  prisma = defaultPrisma,
}: {
  companyId: string;
  callId: string;
  phoneNumber: string;
  reason: string;
  studentId?: string | null;
  prisma?: PrismaClientLike;
}) {
  const normalizedReason = normalizeString(reason) || "callback_requested";
  const existing = await prisma.autoscuolaVoiceCallbackTask.findFirst({
    where: {
      companyId,
      callId,
      status: { in: ["pending", "in_progress"] },
      reason: normalizedReason,
    },
    select: {
      id: true,
      companyId: true,
      callId: true,
      studentId: true,
      phoneNumber: true,
      reason: true,
      status: true,
      nextAttemptAt: true,
      createdAt: true,
    },
  });
  if (existing) {
    return existing;
  }

  return prisma.autoscuolaVoiceCallbackTask.create({
    data: {
      companyId,
      callId,
      studentId: studentId ?? null,
      phoneNumber: normalizePhone(phoneNumber) || phoneNumber,
      reason: normalizedReason,
      status: "pending",
      nextAttemptAt: new Date(),
      attemptCount: 0,
    },
    select: {
      id: true,
      companyId: true,
      callId: true,
      studentId: true,
      phoneNumber: true,
      reason: true,
      status: true,
      nextAttemptAt: true,
      createdAt: true,
    },
  });
}

export async function verifyVoiceStudentDob({
  companyId,
  phoneNumber,
  dob,
  prisma = defaultPrisma,
}: {
  companyId: string;
  phoneNumber: string;
  dob: string;
  prisma?: PrismaClientLike;
}) {
  const student = await findCompanyStudentByPhone({
    prisma,
    companyId,
    phone: phoneNumber,
  });
  if (!student) {
    return {
      verified: false,
      reason: "student_not_found",
      student: null,
    };
  }

  const expectedDob = parseDate(student.dob);
  const providedDob = parseDate(dob);
  if (!expectedDob || !providedDob) {
    return {
      verified: false,
      reason: "dob_unavailable",
      student,
    };
  }

  return {
    verified: expectedDob === providedDob,
    reason: expectedDob === providedDob ? null : "dob_mismatch",
    student,
  };
}

export async function getVoiceStudentByPhone({
  companyId,
  phoneNumber,
  prisma = defaultPrisma,
}: {
  companyId: string;
  phoneNumber: string;
  prisma?: PrismaClientLike;
}) {
  return findCompanyStudentByPhone({
    prisma,
    companyId,
    phone: phoneNumber,
  });
}

export async function getAutoscuolaVoiceCalls({
  companyId,
  limit = 20,
  cursor,
  status,
  prisma = defaultPrisma,
}: {
  companyId: string;
  limit?: number;
  cursor?: string | null;
  status?: string | null;
  prisma?: PrismaClientLike;
}) {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const where = {
    companyId,
    ...(status ? { status } : {}),
  };

  const calls = await prisma.autoscuolaVoiceCall.findMany({
    where,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    take: safeLimit,
    select: {
      id: true,
      twilioCallSid: true,
      fromNumber: true,
      toNumber: true,
      status: true,
      outcome: true,
      summary: true,
      startedAt: true,
      endedAt: true,
      durationSec: true,
      needsCallback: true,
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      line: {
        select: {
          id: true,
          displayNumber: true,
          twilioNumber: true,
        },
      },
    },
  });

  return {
    items: calls,
    nextCursor: calls.length >= safeLimit ? calls[calls.length - 1]?.id ?? null : null,
    limit: safeLimit,
  };
}

export async function getAutoscuolaVoiceCallDetails({
  companyId,
  callId,
  prisma = defaultPrisma,
}: {
  companyId: string;
  callId: string;
  prisma?: PrismaClientLike;
}) {
  return prisma.autoscuolaVoiceCall.findFirst({
    where: { id: callId, companyId },
    select: {
      id: true,
      twilioCallSid: true,
      fromNumber: true,
      toNumber: true,
      status: true,
      startedAt: true,
      endedAt: true,
      durationSec: true,
      outcome: true,
      summary: true,
      recordingSid: true,
      recordingUrl: true,
      transcriptText: true,
      needsCallback: true,
      createdAt: true,
      updatedAt: true,
      line: {
        select: {
          id: true,
          displayNumber: true,
          twilioNumber: true,
          status: true,
        },
      },
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      appointment: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          type: true,
        },
      },
      turns: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          speaker: true,
          text: true,
          confidence: true,
          createdAt: true,
        },
      },
      callbackTasks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          phoneNumber: true,
          reason: true,
          status: true,
          nextAttemptAt: true,
          attemptCount: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
}

export async function createAutoscuolaVoiceKnowledgeChunk({
  companyId,
  title,
  content,
  tags,
  scope = "company",
  active = true,
  prisma = defaultPrisma,
}: {
  companyId: string;
  title: string;
  content: string;
  tags?: string[];
  scope?: "company" | "global";
  active?: boolean;
  prisma?: PrismaClientLike;
}) {
  const normalizedTags = Array.from(
    new Set(
      (tags ?? [])
        .map((tag) => normalizeString(tag).toLowerCase())
        .filter(Boolean),
    ),
  );
  return prisma.autoscuolaVoiceKnowledgeChunk.create({
    data: {
      scope,
      companyId: scope === "company" ? companyId : null,
      title: normalizeString(title),
      content: normalizeString(content),
      tags: normalizedTags,
      language: "it-IT",
      active,
    },
  });
}

export async function updateAutoscuolaVoiceKnowledgeChunk({
  companyId,
  chunkId,
  title,
  content,
  tags,
  active,
  prisma = defaultPrisma,
}: {
  companyId: string;
  chunkId: string;
  title?: string;
  content?: string;
  tags?: string[];
  active?: boolean;
  prisma?: PrismaClientLike;
}) {
  const chunk = await prisma.autoscuolaVoiceKnowledgeChunk.findFirst({
    where: {
      id: chunkId,
      OR: [{ scope: "global" }, { companyId }],
    },
    select: {
      id: true,
      scope: true,
      companyId: true,
    },
  });
  if (!chunk) {
    throw new Error("Chunk non trovato.");
  }

  const normalizedTags =
    tags === undefined
      ? undefined
      : Array.from(
          new Set(
            tags
              .map((tag) => normalizeString(tag).toLowerCase())
              .filter(Boolean),
          ),
        );
  return prisma.autoscuolaVoiceKnowledgeChunk.update({
    where: { id: chunk.id },
    data: {
      ...(title !== undefined ? { title: normalizeString(title) } : {}),
      ...(content !== undefined ? { content: normalizeString(content) } : {}),
      ...(normalizedTags !== undefined ? { tags: normalizedTags } : {}),
      ...(active !== undefined ? { active } : {}),
    },
  });
}

export async function searchAutoscuolaVoiceKnowledge({
  companyId,
  query,
  limit = 8,
  prisma = defaultPrisma,
}: {
  companyId: string;
  query: string;
  limit?: number;
  prisma?: PrismaClientLike;
}) {
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  const normalized = normalizeString(query);
  if (!normalized) return [];
  return prisma.autoscuolaVoiceKnowledgeChunk.findMany({
    where: {
      active: true,
      language: "it-IT",
      OR: [{ scope: "global" }, { scope: "company", companyId }],
      AND: [
        {
          OR: [
            { title: { contains: normalized, mode: "insensitive" } },
            { content: { contains: normalized, mode: "insensitive" } },
            { tags: { has: normalized.toLowerCase() } },
          ],
        },
      ],
    },
    orderBy: [{ scope: "desc" }, { updatedAt: "desc" }],
    take: safeLimit,
    select: {
      id: true,
      scope: true,
      title: true,
      content: true,
      tags: true,
      updatedAt: true,
    },
  });
}

export async function listAutoscuolaVoiceKnowledge({
  companyId,
  active,
  limit = 50,
  prisma = defaultPrisma,
}: {
  companyId: string;
  active?: boolean;
  limit?: number;
  prisma?: PrismaClientLike;
}) {
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  return prisma.autoscuolaVoiceKnowledgeChunk.findMany({
    where: {
      ...(active === undefined ? {} : { active }),
      OR: [{ scope: "global" }, { scope: "company", companyId }],
      language: "it-IT",
    },
    orderBy: [{ scope: "desc" }, { updatedAt: "desc" }],
    take: safeLimit,
  });
}

export async function cleanupAutoscuolaVoiceRetention({
  now = new Date(),
  prisma = defaultPrisma,
}: {
  now?: Date;
  prisma?: PrismaClientLike;
}) {
  const cutoff = new Date(
    now.getTime() - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const staleCalls = await prisma.autoscuolaVoiceCall.findMany({
    where: {
      startedAt: { lt: cutoff },
      OR: [
        { transcriptText: { not: null } },
        { recordingUrl: { not: null } },
        { recordingSid: { not: null } },
      ],
    },
    select: { id: true },
    take: 500,
  });

  if (!staleCalls.length) {
    return { updatedCalls: 0, deletedTurns: 0 };
  }

  const callIds = staleCalls.map((call) => call.id);

  const [deleteTurnsResult, updateCallsResult] = await prisma.$transaction([
    prisma.autoscuolaVoiceCallTurn.deleteMany({
      where: { callId: { in: callIds } },
    }),
    prisma.autoscuolaVoiceCall.updateMany({
      where: { id: { in: callIds } },
      data: {
        transcriptText: null,
        recordingSid: null,
        recordingUrl: null,
      },
    }),
  ]);

  return {
    updatedCalls: updateCallsResult.count,
    deletedTurns: deleteTurnsResult.count,
  };
}

export function verifyRuntimeHmacSignature({
  timestamp,
  signature,
  payload,
}: {
  timestamp: string | null;
  signature: string | null;
  payload: string;
}) {
  const secret = normalizeString(process.env.VOICE_RUNTIME_SHARED_SECRET);
  if (!secret) {
    return false;
  }
  if (!timestamp || !signature) return false;

  const millis = Number(timestamp);
  if (!Number.isFinite(millis)) return false;
  if (Math.abs(Date.now() - millis) > 5 * 60 * 1000) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
