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
  /** Blocco automatico prenotazioni quando l'allievo supera la soglia di guide
   * da pagare non saldate. Impostazione a livello di autoscuola. */
  autoBookingBlockEnabled?: boolean;
  autoBookingBlockThreshold?: number;
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
  /**
   * @deprecated Use `quizSeats` + `phasesEnabled` instead. Kept temporarily for
   * read compatibility during the student-phase rollout; the field is removed
   * from the DB JSONB by the migration. Will be deleted from this type once
   * all consumers have been refactored.
   */
  quizEnabled?: boolean;
  /**
   * Phases of the student journey that this autoscuola offers. At least one
   * must be active. Default `['PRATICA']` (legacy behaviour). When `'TEORIA'`
   * is included, the company can grant quiz seats and students born under it
   * land in AWAITING (or TEORIA if auto-assign + seat available).
   */
  phasesEnabled?: Array<"TEORIA" | "PRATICA">;
  /**
   * Number of nominal quiz licenses the autoscuola has purchased. Counter of
   * consumed seats = `COUNT(CompanyMember WHERE quizSeatGrantedAt IS NOT NULL)`.
   * Once a seat is granted to a student it is burnt for life (non-reassignable),
   * so this counter only grows. Default 0.
   */
  quizSeats?: number;
  /**
   * If true, new students registering via the autoscuola code receive a quiz
   * seat (and TEORIA phase) automatically — provided seats are available.
   * If false, they land in AWAITING and the titolare assigns manually.
   * Toggle OFF→ON triggers FIFO promotion of existing AWAITING students.
   * Only relevant when `'TEORIA'` is in `phasesEnabled`. Default false.
   */
  autoAssignQuizOnSignup?: boolean;
  /**
   * Reglo Aula — lezioni di teoria in aula (slide + quiz live).
   * Quando true la company vede il modulo Aula. Default false.
   * Vedi docs/features/reglo-aula.md.
   */
  aulaEnabled?: boolean;
  /**
   * Modalità "solo Segretaria": la company ha attivato SOLO il modulo
   * segreteria vocale AI, non l'intera suite autoscuole. Quando true la web
   * app mostra unicamente l'area Segretaria + le sue impostazioni (niente
   * Agenda/Allievi/Rinnovi né gli altri pane di configurazione). Richiede
   * `voiceFeatureEnabled: true` per avere contenuto. Default false.
   * Vedi docs/features/secretary-only.md.
   */
  secretaryOnly?: boolean;
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

/**
 * true se la company è in modalità "solo Segretaria" (ha attivato solo il
 * modulo segreteria vocale AI). Guida il gating della web app: nav, landing e
 * pane impostazioni mostrano solo l'area Segretaria.
 */
export const isSecretaryOnly = (
  services: CompanyServiceInfo[] | null | undefined,
): boolean => getServiceLimits(services, "AUTOSCUOLE").secretaryOnly === true;
