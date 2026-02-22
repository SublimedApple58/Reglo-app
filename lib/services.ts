import type { CompanyService } from "@prisma/client";

export const SERVICE_KEYS = [
  "DOC_MANAGER",
  "WORKFLOWS",
  "AI_ASSISTANT",
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
  instructorBookingMode?: "manual_full" | "manual_engine" | "guided_proposal";
};

export type CompanyServiceInfo = {
  key: ServiceKey;
  status: ServiceStatus;
  limits: ServiceLimits | null;
};

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  DOC_MANAGER: "Doc manager",
  WORKFLOWS: "Workflows",
  AI_ASSISTANT: "AI Assistant",
  AUTOSCUOLE: "Reglo Autoscuole",
};

export const DEFAULT_SERVICE_LIMITS: Record<ServiceKey, ServiceLimits> = {
  DOC_MANAGER: { documentsPerMonth: 300 },
  WORKFLOWS: { workflowRunsPerMonth: 30 },
  AI_ASSISTANT: { aiCreditsPerMonth: 200 },
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
