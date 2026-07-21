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
   * Rinnovo Patenti — abilitazione COMMERCIALE del modulo (gestita dal
   * backoffice). Quando true la company vede la sezione "Rinnovi".
   * Default false. Vedi docs/features/rinnovo-patenti.md.
   */
  licenseRenewalEnabled?: boolean;
  /**
   * Rinnovo Patenti — interruttore del TITOLARE: se false il link pubblico è
   * sospeso (es. medico in ferie) pur restando il modulo abilitato.
   * `undefined` = attivo (default friendly all'attivazione da backoffice).
   */
  licenseRenewalPublicActive?: boolean;
  /**
   * Rinnovo Patenti — se true il certificato anamnestico del medico curante è
   * tra i documenti OBBLIGATORI (la prassi varia per medico/regione: non è
   * imposto a livello nazionale). Default false = facoltativo.
   */
  licenseRenewalAnamnesticRequired?: boolean;
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
