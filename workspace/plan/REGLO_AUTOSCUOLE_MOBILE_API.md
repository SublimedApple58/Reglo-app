# Reglo Autoscuole — Mobile API (V1)

> Questo file è il **prompt operativo** da dare all’agente AI che sviluppa l’app mobile.
> L’agente deve creare nel repo mobile un **client SDK** (es. `services/regloApi.ts`)
> che incapsula queste chiamate e gestisce token + errori.

## Linee guida per l’agente mobile
- Creare un wrapper `apiClient(baseUrl)` con:
  - gestione `Authorization: Bearer <token>`
  - gestione errori standard `{ success, message }`
  - default `baseUrl` (prod): `https://app.reglo.it/api`
- Salvare token in secure storage (Keychain/Keystore).
- Usare `x-reglo-company-id` solo quando serve cambiare company attiva.
- Loggare errori di rete in console (debug).

## Ruoli Autoscuola (OBBLIGATORIO)
L’app mobile **deve cambiare UI/feature** in base a `autoscuolaRole`.
Il BE restituisce il ruolo in:
- `POST /api/mobile/auth/login` → `data.autoscuolaRole`
- `GET /api/mobile/me` → `data.autoscuolaRole`
- `companies[].autoscuolaRole`

Mappa ruoli:
- `OWNER` → **Titolare**
- `INSTRUCTOR` → **Istruttore**
- `STUDENT` → **Allievo**

Comportamento richiesto:
- Se `autoscuolaRole` è `null` o mancante → mostra schermata blocco con CTA “Contatta admin”.
- **Owner**: dashboard KPI + gestione veicoli + disponibilità veicoli + override slot.
- **Instructor**: agenda giornaliera + check‑in/no‑show/completed + disponibilità personali + gestione veicoli (view/edit).
- **Student**: disponibilità personali + prenota guida (giorno + preferenze) + annulla + storico.

Nota: il ruolo è **per-company**. Se l’utente cambia company, **ricalcola UI** in base al nuovo `autoscuolaRole`.

## Auth
- `POST /api/mobile/auth/login`
  - **Input:** `{ email, password }`
  - **Output:** `ApiSuccess<AuthPayload>`
  - **Uso:** salva `token` e `activeCompanyId`
- `POST /api/mobile/auth/signup`
  - **Input:** `{ companyName, name, email, password, confirmPassword }`
  - **Output:** `ApiSuccess<AuthPayload>`
- `POST /api/mobile/auth/logout` (Bearer)
  - **Input:** nessuno
  - **Output:** `ApiSuccess<LogoutPayload>`
- `GET /api/mobile/me` (Bearer)
  - **Output:** `ApiSuccess<MePayload>`
- `POST /api/mobile/auth/select-company` (Bearer)
  - **Input:** `{ companyId }`
  - **Output:** `ApiSuccess<SelectCompanyPayload>`

## Autoscuole core
- `GET /api/autoscuole/overview`
  - **Output:** `ApiSuccess<AutoscuolaOverview>`
- `GET /api/autoscuole/students` (+ `?search=`)
  - **Output:** `ApiSuccess<AutoscuolaStudent[]>`
- `POST /api/autoscuole/students`
  - **Input:** `CreateStudentInput`
  - **Output:** `ApiSuccess<AutoscuolaStudent>`
- `GET /api/autoscuole/cases`
  - **Output:** `ApiSuccess<AutoscuolaCase[]>`
- `POST /api/autoscuole/cases`
  - **Input:** `CreateCaseInput`
  - **Output:** `ApiSuccess<AutoscuolaCase>`
- `PATCH /api/autoscuole/cases/:id/status` `{ status }`
  - **Input:** `UpdateCaseStatusInput`
  - **Output:** `ApiSuccess<AutoscuolaCaseWithStudent>`
- `GET /api/autoscuole/appointments`
  - **Output:** `ApiSuccess<AutoscuolaAppointmentWithRelations[]>`
- `POST /api/autoscuole/appointments`
  - **Input:** `CreateAppointmentInput`
  - **Output:** `ApiSuccess<AutoscuolaAppointment>`
- `PATCH /api/autoscuole/appointments/:id/status` `{ status }`
  - **Input:** `UpdateAppointmentStatusInput` (es. `checked_in`, `no_show`, `completed`)
  - **Output:** `ApiSuccess<AutoscuolaAppointment>`
- `POST /api/autoscuole/appointments/:id/cancel`
  - **Output:** `ApiSuccess<CancelAppointmentResult>`
- `GET /api/autoscuole/instructors`
  - **Output:** `ApiSuccess<AutoscuolaInstructor[]>`
- `POST /api/autoscuole/instructors`
  - **Input:** `CreateInstructorInput`
  - **Output:** `ApiSuccess<AutoscuolaInstructor>`
- `GET /api/autoscuole/vehicles`
  - **Output:** `ApiSuccess<AutoscuolaVehicle[]>`
- `POST /api/autoscuole/vehicles`
  - **Input:** `CreateVehicleInput`
  - **Output:** `ApiSuccess<AutoscuolaVehicle>`
- `GET /api/autoscuole/deadlines`
  - **Output:** `ApiSuccess<AutoscuolaDeadlineItem[]>`

## Availability Engine
- `POST /api/autoscuole/availability/slots`
  - **Input:** `CreateAvailabilitySlotsInput`
  - `ownerType` = `student | instructor | vehicle`
  - **Output:** `ApiSuccess<CreateSlotsResult>`
  - **Effetto:** genera slot da 30 minuti
- `GET /api/autoscuole/availability/slots?ownerType=...&ownerId=...&date=YYYY-MM-DD`
  - **Output:** `ApiSuccess<AutoscuolaAvailabilitySlot[]>`
- `POST /api/autoscuole/booking-requests`
  - **Input:** `CreateBookingRequestInput`
  - **Output:** `ApiSuccess<CreateBookingRequestResult>`
- `POST /api/autoscuole/waitlist/offers/:offerId/respond`
  - **Input:** `RespondWaitlistOfferInput`
  - **Output:** `ApiSuccess<RespondWaitlistOfferResult>`

## Auth header
Usare `Authorization: Bearer <token>`

Per cambiare company attiva, passare `x-reglo-company-id` o usare `/api/mobile/auth/select-company`.

---

## Prompt operativo per l’agente mobile (copiabile)
```
Obiettivo: integrare il BE Reglo Autoscuole nel progetto mobile.
Base URL: https://app.reglo.it/api
Auth: usa Bearer token. Endpoint login/signup/logout/me/select-company.
Gestisci ruoli autoscuola:
- Ruolo si trova in data.autoscuolaRole (login/me) e in companies[].autoscuolaRole.
- Se ruolo assente/null, blocca l’esperienza con CTA “Contatta admin”.
UI role-based:
OWNER: dashboard KPI + gestione veicoli + disponibilità veicoli + override slot.
INSTRUCTOR: agenda giornaliera + check‑in/no‑show/completed + disponibilità + veicoli.
STUDENT: disponibilità personali + prenota/annulla guida + storico.
Per cambiare company: usa /api/mobile/auth/select-company o header x-reglo-company-id.
Usa i tipi TS e gli endpoint definiti nel file REGLO_AUTOSCUOLE_MOBILE_API.md.
```

## Tipi TypeScript (V1)

```ts
export type IsoDate = string; // DateTime serializzato JSON
export type Uuid = string;

export type ApiSuccess<T> = { success: true; data: T };
export type ApiError = { success: false; message: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type ServiceKey = "DOC_MANAGER" | "WORKFLOWS" | "AI_ASSISTANT" | "AUTOSCUOLE";
export type CompanyServiceStatus = "ACTIVE" | "DISABLED";

export type CompanyService = {
  id: Uuid;
  companyId: Uuid;
  serviceKey: ServiceKey;
  status: CompanyServiceStatus;
  limits: Record<string, unknown> | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type CompanySummary = {
  id: Uuid;
  name: string;
  logoKey: string | null;
  role: "admin" | "member" | string;
  autoscuolaRole: "OWNER" | "INSTRUCTOR" | "STUDENT" | null;
  services: CompanyService[];
};

export type UserPublic = {
  id: Uuid;
  name: string | null;
  email: string;
  role: string;
};

export type AuthPayload = {
  token: string;
  expiresAt: IsoDate;
  user: UserPublic;
  activeCompanyId: Uuid | null;
  autoscuolaRole: "OWNER" | "INSTRUCTOR" | "STUDENT" | null;
  companies: CompanySummary[];
};

export type MePayload = {
  user: UserPublic;
  activeCompanyId: Uuid | null;
  autoscuolaRole: "OWNER" | "INSTRUCTOR" | "STUDENT" | null;
  companies: CompanySummary[];
};

export type LogoutPayload = { success: true };
export type SelectCompanyPayload = { activeCompanyId: Uuid };

// Autoscuole core models
export type AutoscuolaStudent = {
  id: Uuid;
  companyId: Uuid;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  notes: string | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type AutoscuolaCase = {
  id: Uuid;
  companyId: Uuid;
  studentId: Uuid;
  category: string | null;
  status: string;
  theoryExamAt: IsoDate | null;
  drivingExamAt: IsoDate | null;
  pinkSheetExpiresAt: IsoDate | null;
  medicalExpiresAt: IsoDate | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type AutoscuolaCaseWithStudent = AutoscuolaCase & {
  student: AutoscuolaStudent;
};

export type AutoscuolaInstructor = {
  id: Uuid;
  companyId: Uuid;
  name: string;
  phone: string | null;
  status: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type AutoscuolaVehicle = {
  id: Uuid;
  companyId: Uuid;
  name: string;
  plate: string | null;
  status: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type AutoscuolaAppointment = {
  id: Uuid;
  companyId: Uuid;
  studentId: Uuid;
  caseId: Uuid | null;
  slotId: Uuid | null;
  type: string;
  startsAt: IsoDate;
  endsAt: IsoDate | null;
  status: string;
  instructorId: Uuid | null;
  vehicleId: Uuid | null;
  notes: string | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type AutoscuolaAppointmentWithRelations = AutoscuolaAppointment & {
  student: AutoscuolaStudent;
  case: AutoscuolaCase | null;
  instructor: AutoscuolaInstructor | null;
  vehicle: AutoscuolaVehicle | null;
};

export type AutoscuolaOverview = {
  studentsCount: number;
  activeCasesCount: number;
  upcomingAppointmentsCount: number;
  overdueInstallmentsCount: number;
};

export type AutoscuolaDeadlineItem = {
  id: string;
  caseId: Uuid;
  studentId: Uuid;
  studentName: string;
  deadlineType: string; // PINK_SHEET_EXPIRES | MEDICAL_EXPIRES
  deadlineDate: IsoDate;
  status: "overdue" | "soon" | "ok";
  caseStatus: string;
};

// Availability engine
export type AutoscuolaAvailabilitySlot = {
  id: Uuid;
  companyId: Uuid;
  ownerType: "student" | "instructor" | "vehicle" | string;
  ownerId: Uuid;
  startsAt: IsoDate;
  endsAt: IsoDate;
  status: "open" | "held" | "booked" | "cancelled" | string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type AutoscuolaBookingRequest = {
  id: Uuid;
  companyId: Uuid;
  studentId: Uuid;
  desiredDate: IsoDate;
  status: "pending" | "matched" | "cancelled" | string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type AutoscuolaWaitlistOffer = {
  id: Uuid;
  companyId: Uuid;
  slotId: Uuid;
  status: "broadcasted" | "accepted" | "expired" | string;
  sentAt: IsoDate;
  expiresAt: IsoDate;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

export type AutoscuolaWaitlistResponse = {
  id: Uuid;
  offerId: Uuid;
  studentId: Uuid;
  status: "accepted" | "declined" | "expired" | string;
  respondedAt: IsoDate;
  createdAt: IsoDate;
  updatedAt: IsoDate;
};

// Inputs
export type CreateStudentInput = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status?: string;
  notes?: string;
};

export type CreateCaseInput = {
  studentId: Uuid;
  category?: string;
  status?: string;
  theoryExamAt?: IsoDate;
  drivingExamAt?: IsoDate;
  pinkSheetExpiresAt?: IsoDate;
  medicalExpiresAt?: IsoDate;
};

export type UpdateCaseStatusInput = { status: string };

export type CreateAppointmentInput = {
  studentId: Uuid;
  caseId?: Uuid | null;
  type: string;
  startsAt: IsoDate;
  endsAt?: IsoDate | null;
  instructorId: Uuid;
  vehicleId: Uuid;
  notes?: string;
};

export type UpdateAppointmentStatusInput = { status: string };

export type CreateInstructorInput = { name: string; phone?: string };
export type CreateVehicleInput = { name: string; plate?: string };

export type CreateAvailabilitySlotsInput = {
  ownerType: "student" | "instructor" | "vehicle";
  ownerId: Uuid;
  startsAt: IsoDate;
  endsAt: IsoDate;
};

export type CreateBookingRequestInput = {
  studentId: Uuid;
  desiredDate: IsoDate;
};

export type RespondWaitlistOfferInput = {
  studentId: Uuid;
  response: "accept" | "decline";
};

// Results
export type CreateSlotsResult = { count: number };

export type CreateBookingRequestResult =
  | { matched: true; appointment: AutoscuolaAppointment; request: AutoscuolaBookingRequest }
  | { matched: false; request: AutoscuolaBookingRequest };

export type RespondWaitlistOfferResult =
  | { accepted: true; appointment: AutoscuolaAppointment; response: AutoscuolaWaitlistResponse }
  | { accepted: false; response: AutoscuolaWaitlistResponse };

export type CancelAppointmentResult =
  | { rescheduled: true; newStartsAt: IsoDate }
  | { rescheduled: false; broadcasted?: boolean };
```
