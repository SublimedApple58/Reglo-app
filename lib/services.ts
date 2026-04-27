import type { CompanyService } from "@prisma/client";

export const SERVICE_KEYS = [
  "AUTOSCUOLE",
] as const;

export type ServiceKey = (typeof SERVICE_KEYS)[number];

export type ServiceStatus = "active" | "disabled";

export type ServiceLimits = {
  documentsPerMonth?: number;
  workflowRunsPerMonth?: number;
  aiCreditsPerMonth?: number;
  availabilityWeeks?: number;
  studentReminderMinutes?: number;
  instructorReminderMinutes?: number;
  slotFillChannels?: ("push" | "whatsapp" | "email")[];
  studentReminderChannels?: ("push" | "whatsapp" | "email")[];
  instructorReminderChannels?: ("push" | "whatsapp" | "email")[];
  appBookingActors?: "students" | "instructors" | "both";
  instructorBookingMode?: "manual_full" | "manual_engine";
  weeklyBookingLimitEnabled?: boolean;
  weeklyBookingLimit?: number;
  examPriorityEnabled?: boolean;
  examPriorityDaysBeforeExam?: number;
  examPriorityBlockNonExam?: boolean;
  voiceFeatureEnabled?: boolean;
  voiceProvisioningStatus?: "not_started" | "provisioning" | "pending_approval" | "ready" | "error";
  voiceLineRef?: string | null;
  voiceDisplayNumber?: string | null;
  voicePendingOrderId?: string | null;
  voicePendingPhoneNumber?: string | null;
  voicePendingPhoneSid?: string | null;
  voiceAssistantEnabled?: boolean;
  voiceBookingEnabled?: boolean;
  voiceLanguage?: "it-IT";
  voiceLegalGreetingEnabled?: boolean;
  voiceOfficeHours?: {
    daysOfWeek: number[];
    startMinutes: number;
    endMinutes: number;
  } | null;
  voiceHandoffPhone?: string | null;
  voiceHandoffDuringCallEnabled?: boolean;
  voiceHandoffDuringCallInstructions?: string;
  voiceFallbackMode?: "transfer_or_callback";
  voiceRecordingEnabled?: boolean;
  voiceTranscriptionEnabled?: boolean;
  voiceRetentionDays?: 90;
  voiceInstructions?: string;
  voiceAllowedActions?: Array<"faq" | "lesson_info" | "booking">;
  voiceAssistantVoice?: string;
  voiceCustomGreeting?: string | null;
  studentNotesEnabled?: boolean;
};

export type CompanyServiceInfo = {
  key: ServiceKey;
  status: ServiceStatus;
  limits: ServiceLimits | null;
};

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  AUTOSCUOLE: "Reglo Autoscuole",
};

export const DEFAULT_SERVICE_LIMITS: Record<ServiceKey, ServiceLimits> = {
  AUTOSCUOLE: {},
};

export const normalizeCompanyServices = (
  services: CompanyService[] | null | undefined,
): CompanyServiceInfo[] => {
  if (!services?.length) return [];
  return services.map((service) => ({
    key: service.serviceKey as ServiceKey,
    status: service.status === "ACTIVE" ? "active" : "disabled",
    limits: (service.limits ?? null) as ServiceLimits | null,
  }));
};

export const isServiceActive = (
  services: CompanyServiceInfo[] | null | undefined,
  key: ServiceKey,
  fallbackActive = true,
) => {
  if (!services || services.length === 0) return fallbackActive;
  const match = services.find((service) => service.key === key);
  if (!match) return fallbackActive;
  return match.status === "active";
};

export const getServiceLimits = (
  services: CompanyServiceInfo[] | null | undefined,
  key: ServiceKey,
) => {
  const match = services?.find((service) => service.key === key);
  if (!match?.limits) return DEFAULT_SERVICE_LIMITS[key];
  return { ...DEFAULT_SERVICE_LIMITS[key], ...match.limits };
};
