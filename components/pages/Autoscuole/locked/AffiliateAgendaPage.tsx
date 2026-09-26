"use client";

/**
 * Agenda in **scope Consorzio** di un'autoscuola consorziata (REG-429, Fase 7).
 *
 * Non è un'agenda diversa: è **l'agenda**. Griglia, colonne per istruttore,
 * intestazioni giorno, badge di oggi, altezza delle righe, card, colori,
 * hover, toolbar, vista Settimana/Giorno — tutto arriva da
 * `AutoscuoleAgendaPage`, che qui riceve solo una `source`: da dove prendere i
 * dati e cosa si può fare.
 *
 * Il primo giro aveva una griglia riscritta a mano: stessi contenuti, ma
 * sembrava un'altra applicazione (etichette troncate, blocchi di un'altra
 * taglia, toolbar diversa). Bocciata da Tiziano, e giustamente.
 *
 * Cosa finisce sulla griglia:
 * - le **richieste della scuola** nei quattro stati, come card normali con lo
 *   stato nella tinta (`consortium_*` in `getStatusMeta`);
 * - gli **slot occupati** dal consorzio: ci sono, ma senza nome e senza tipo —
 *   `getAffiliateAgenda` legge tre campi dell'appuntamento e nient'altro.
 */

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Ban, CalendarPlus, Car, GraduationCap, Plus, Search, Sun, Users, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { DatePickerInput } from "@/components/ui/date-picker";
import { TimePickerInput } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import {
  cancelAffiliateGuideRequest,
  createAffiliateStudent,
  dismissAffiliateGuideRequest,
  getAffiliateAgenda,
  listAffiliateStudents,
  respondToAffiliateProposedSlot,
  sendAffiliateGuideRequest,
  type AffiliateAgendaData,
  type AffiliateGuideRequestRow,
  type AffiliateStudent,
} from "@/lib/actions/affiliate.actions";
import {
  AutoscuoleAgendaPage,
  StudentSearchSelect,
  type AgendaBootstrapPayload,
  type AgendaSource,
} from "@/components/pages/Autoscuole/AutoscuoleAgendaPage";
import { LockedCard, LOCKED_SECTIONS, useDemoAgendaSource } from "./LockedSection";

const DURATIONS = [30, 45, 60, 90, 120];

const pad = (n: number) => String(n).padStart(2, "0");
const formatYmd = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const splitName = (name: string) => {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return { firstName: "—", lastName: "" };
  const [first, ...rest] = clean.split(" ");
  return { firstName: first, lastName: rest.join(" ") };
};

/** Stato della richiesta → stato dell'appuntamento, che l'agenda sa già tingere. */
const STATUS_BY_REQUEST: Record<AffiliateGuideRequestRow["status"], string> = {
  pending: "consortium_pending",
  accepted: "scheduled",
  rejected: "consortium_rejected",
  cancelled: "consortium_cancelled",
};

/**
 * Dati della consorziata → payload di bootstrap dell'agenda.
 *
 * Le richieste ancora in attesa non hanno un istruttore (lo sceglie il
 * consorzio accettando): finiscono nella prima colonna, che è dove la scuola
 * le va a cercare. Inventare un istruttore sarebbe peggio.
 */
function toBootstrap(data: AffiliateAgendaData, from: Date, to: Date): AgendaBootstrapPayload {
  const instructors = data.instructors.length
    ? data.instructors
    : [{ id: "__consorzio__", name: "Consorzio" }];
  const fallbackColumn = instructors[0].id;
  const nameOf = (id: string) => instructors.find((i) => i.id === id)?.name ?? "";

  const requests = data.requests.map((request) => {
    const { firstName, lastName } = splitName(request.studentName);
    const startsAt = new Date(request.startsAt);
    const columnId = request.instructorId ?? fallbackColumn;
    return {
      id: request.id,
      type: "guida",
      status: STATUS_BY_REQUEST[request.status],
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + request.durationMinutes * 60000).toISOString(),
      student: { id: `req:${request.id}`, firstName, lastName },
      instructor: { id: columnId, name: nameOf(columnId) },
      vehicle: request.vehicleName ? { id: `veh:${request.id}`, name: request.vehicleName } : null,
      // Note della card: tutto quello che la richiesta sa e la card non ha già
      // in una riga sua (istruttore, mezzo, controproposta).
      notes:
        [
          request.proposedStartsAt
            ? `Il consorzio propone ${new Date(request.proposedStartsAt).toLocaleString("it-IT", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : null,
          request.instructorName ? `Istruttore · ${request.instructorName}` : null,
          request.vehicleName ? `Mezzo · ${request.vehicleName}` : null,
        ]
          .filter(Boolean)
          .join("\n") || null,
    };
  });

  const busy = data.busy.map((slot, index) => {
    const columnId = slot.instructorId ?? fallbackColumn;
    return {
      id: `busy:${index}`,
      type: "guida",
      status: "consortium_busy",
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      // Nessun nome: è il punto. La card mostra "Occupato" e basta.
      student: { id: `busy:${index}`, firstName: "Occupato", lastName: "" },
      instructor: { id: columnId, name: nameOf(columnId) },
      vehicle: null,
    };
  });

  return {
    appointments: [...requests, ...busy],
    // La card mostra "Patente X" leggendo da qui (`studentLicenseById`), non
    // dall'appuntamento: stessa strada dell'agenda vera.
    students: data.requests.map((request) => {
      const { firstName, lastName } = splitName(request.studentName);
      return {
        id: `req:${request.id}`,
        firstName,
        lastName,
        licenseCategory: request.licenseCategory,
      };
    }),
    instructors,
    vehicles: data.vehicles,
    vehiclesEnabled: false,
    groupLessonsEnabled: false,
    holidays: [],
    instructorBlocks: [],
    meta: {
      from: from.toISOString(),
      to: to.toISOString(),
      generatedAt: new Date().toISOString(),
      count: requests.length + busy.length,
    },
  };
}

type Scope = "consorzio" | "autoscuola";

export function AffiliateAgendaPage({
  scope: scopeProp,
  onScope,
}: {
  /**
   * Presenti quando la pagina è una delle due viste di un'autoscuola che Reglo
   * **ce l'ha** (Fase 8): lì lo scope è condiviso con l'agenda vera, che è un
   * componente diverso. Senza props se lo gestisce da sé (vista ridotta).
   */
  scope?: Scope;
  onScope?: (value: Scope) => void;
} = {}) {
  const toast = useFeedbackToast();
  const [scopeState, setScopeState] = React.useState<Scope>("consorzio");
  const scope = scopeProp ?? scopeState;
  const setScope = onScope ?? setScopeState;

  const [data, setData] = React.useState<AffiliateAgendaData | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const reload = React.useCallback(() => setReloadKey((n) => n + 1), []);

  const [requestOpen, setRequestOpen] = React.useState(false);
  const [prefill, setPrefill] = React.useState<{ ymd: string; time: string } | null>(null);
  const [proposal, setProposal] = React.useState<AffiliateGuideRequestRow | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<AffiliateGuideRequestRow | null>(null);

  const searchParams = useSearchParams();
  const deepLinkId = searchParams?.get("guideRequestId") ?? null;
  const handledRequestRef = React.useRef<string | null>(null);

  /**
   * Richieste viste finora, per id. **Non** si sostituisce a ogni fetch:
   * l'agenda ne fa due (la settimana mostrata e il prefetch della successiva),
   * e la seconda azzerava la lista mentre a schermo c'erano ancora le card
   * della prima — la X di "togli dall'agenda" non compariva mai.
   */
  const requestsRef = React.useRef<Map<string, AffiliateGuideRequestRow>>(new Map());

  const fetchBootstrap = React.useCallback(
    async (from: Date, to: Date) => {
      const res = await getAffiliateAgenda({
        from: from.toISOString(),
        to: to.toISOString(),
        ...(deepLinkId ? { focusRequestId: deepLinkId } : {}),
      });
      if (!res.success) throw new Error(res.message);
      setData(res.data);
      // Subito, non in un effetto: l'agenda disegna le card nel render che
      // segue questa promise, e `dismissCard.can` legge da qui. Con un
      // `useEffect` la X non compariva al primo giro.
      // Subito, non in un effetto: l'agenda disegna le card nel render che
      // segue questa promise, e `dismissCard.can` legge da qui.
      for (const request of res.data.requests) requestsRef.current.set(request.id, request);
      if (res.data.focusRequest) {
        requestsRef.current.set(res.data.focusRequest.id, res.data.focusRequest);
      }
      return toBootstrap(res.data, from, to);
    },
    [deepLinkId],
  );

  // Click-through dalla campanella: porta al dialogo della controproposta.
  React.useEffect(() => {
    if (!deepLinkId || !data || handledRequestRef.current === deepLinkId) return;
    const target = requestsRef.current.get(deepLinkId) ?? data.focusRequest;
    if (!target) return;
    handledRequestRef.current = deepLinkId;
    if (target.proposedStartsAt) setProposal(target);
  }, [deepLinkId, data]);


  const source: AgendaSource = React.useMemo(
    () => ({
      fetchBootstrap,
      readOnly: true,
      dismissCard: {
        title: "Togli dall'agenda",
        can: (id) => requestsRef.current.get(id)?.dismissable ?? false,
        run: async (id) => {
          const res = await dismissAffiliateGuideRequest(id);
          if (!res.success) {
            // Niente rosso: è un gesto reversibile, non un guasto.
            toast.info({ description: res.message ?? "Non è stato possibile toglierla." });
            return false;
          }
          requestsRef.current.delete(id);
          return true;
        },
      },
      onCardClick: (appointmentId) => {
        const request = requestsRef.current.get(appointmentId);
        if (!request) return; // slot occupato: non c'è niente da aprire
        if (request.proposedStartsAt) {
          setProposal(request);
          return;
        }
        if (request.status === "pending") setCancelTarget(request);
      },
      menu: {
        items: [
          {
            key: "richiesta",
            label: "Richieste",
            icon: <CalendarPlus className="size-4 text-foreground" strokeWidth={1.7} />,
            onSelect: (slot) => {
              setPrefill(slot ? { ymd: slot.ymd, time: slot.time } : null);
              setRequestOpen(true);
            },
          },
        ],
        // Ci sono, si vedono, non si usano: è il senso della vista ridotta.
        locked: [
          { key: "appuntamento", label: "Appuntamento", icon: <Car className="size-4" strokeWidth={1.7} /> },
          { key: "esame", label: "Esame", icon: <GraduationCap className="size-4" strokeWidth={1.7} /> },
          { key: "blocco", label: "Evento bloccante", icon: <Ban className="size-4" strokeWidth={1.7} /> },
          { key: "gruppo", label: "Guida di gruppo", icon: <Users className="size-4" strokeWidth={1.7} /> },
          {
            key: "festivo",
            label: "Segna festivo",
            icon: <Sun className="size-4" strokeWidth={1.7} />,
            separatorBefore: true,
          },
        ],
      },
    }),
    [fetchBootstrap, toast],
  );

  const scopeControl = React.useMemo(
    () => ({ value: scope, onChange: setScope }),
    [scope, setScope],
  );

  // Vista ridotta, scope Autoscuola: l'agenda propria è la funzione non
  // comprata. Sfocata è **solo la griglia**: la toolbar — segmented compreso —
  // resta nitida e usabile, altrimenti da qui non si tornerebbe più indietro.
  // Con Reglo attivo (Fase 8) questo ramo non si raggiunge: quella vista la
  // monta il chiamante.
  if (scope === "autoscuola" && !onScope) {
    return <AutoscuolaScopeLocked scopeControl={scopeControl} />;
  }

  return (
    <>
      <AutoscuoleAgendaPage
        key={reloadKey}
        tabs={null}
        source={source}
        consorzioScope={scopeControl}
      />

      {requestOpen && data && (
        <GuideRequestDialog
          data={data}
          prefill={prefill}
          onClose={() => setRequestOpen(false)}
          onSent={() => {
            setRequestOpen(false);
            reload();
          }}
        />
      )}

      {proposal && (
        <ProposalDialog
          request={proposal}
          onClose={() => setProposal(null)}
          onDone={() => {
            setProposal(null);
            reload();
          }}
        />
      )}

      {cancelTarget && (
        <CancelRequestDialog
          request={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={() => {
            setCancelTarget(null);
            reload();
          }}
        />
      )}
    </>
  );
}

/* ── Guscio comune dei dialoghi ──────────────────────────────────────── */

function DialogShell({
  title,
  subtitle,
  onClose,
  children,
  width = 490,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/20 p-6">
      <div
        className="w-full rounded-[24px] bg-white p-6 shadow-[0_26px_70px_rgba(10,20,30,0.24)]"
        style={{ maxWidth: width }}
      >
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-[20px] font-bold tracking-[-0.3px] text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#f0f0f0]"
          >
            <X className="size-4 text-[#6a6a6a]" />
          </button>
        </div>
        {subtitle ? (
          <p className="mb-5 text-[13px] leading-[1.45] text-muted-foreground">{subtitle}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/* ── Invio richiesta ─────────────────────────────────────────────────── */

function GuideRequestDialog({
  data,
  prefill,
  onClose,
  onSent,
}: {
  data: AffiliateAgendaData;
  prefill: { ymd: string; time: string } | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useFeedbackToast();
  const [day, setDay] = React.useState(() => prefill?.ymd ?? formatYmd(new Date()));
  const [time, setTime] = React.useState(prefill?.time ?? "15:00");
  const [duration, setDuration] = React.useState(60);
  const [vehicleId, setVehicleId] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);

  const [students, setStudents] = React.useState<AffiliateStudent[]>([]);
  const [studentId, setStudentId] = React.useState<string | null>(null);
  const [creatingStudent, setCreatingStudent] = React.useState(false);
  const [newStudent, setNewStudent] = React.useState({ firstName: "", lastName: "", phone: "" });
  const [savingStudent, setSavingStudent] = React.useState(false);

  const loadStudents = React.useCallback(async () => {
    const res = await listAffiliateStudents();
    if (res.success) setStudents(res.data.students);
  }, []);
  React.useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  /** Forma attesa dal selettore dell'agenda (che è quello vero). */
  const pickerStudents = React.useMemo(
    () =>
      students.map((student) => ({
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        phone: student.phone,
        licenseCategory: student.licenseCategory,
      })),
    [students],
  );

  const startsAt = React.useMemo(() => {
    const [hours, minutes] = time.split(":").map((value) => Number(value));
    const date = new Date(`${day}T00:00:00`);
    date.setHours(hours || 0, minutes || 0, 0, 0);
    return date;
  }, [day, time]);

  /** Stesso calcolo del server: il bottone non promette ciò che verrà rifiutato. */
  const leadError = React.useMemo(() => {
    const hours = data.minLeadHours;
    if (!hours || hours <= 0) return null;
    if (startsAt.getTime() >= Date.now() + hours * 3600_000) return null;
    return `Il consorzio chiede almeno ${hours} ${hours === 1 ? "ora" : "ore"} di preavviso.`;
  }, [data.minLeadHours, startsAt]);

  const canSend = Boolean(studentId) && !leadError && !data.schoolSuspended && !sending;

  const submitStudent = async () => {
    setSavingStudent(true);
    const res = await createAffiliateStudent(newStudent);
    setSavingStudent(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Allievo aggiunto." });
    setCreatingStudent(false);
    setNewStudent({ firstName: "", lastName: "", phone: "" });
    await loadStudents();
    setStudentId(res.data.userId);
  };

  const send = async () => {
    if (!studentId) return;
    setSending(true);
    const res = await sendAffiliateGuideRequest({
      studentUserId: studentId,
      startsAt: startsAt.toISOString(),
      durationMinutes: duration,
      vehicleId,
    });
    setSending(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Richiesta inviata al consorzio." });
    onSent();
  };

  return (
    <DialogShell
      title="Richiesta di guida"
      subtitle="Gli slot grigi in agenda sono occupati dal consorzio. La richiesta resta in attesa finché il consorzio non risponde."
      onClose={onClose}
    >
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Giorno</p>
          <DatePickerInput
            value={day}
            onChange={(value) => setDay(value || day)}
            minDate={new Date()}
          />
        </div>
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Orario</p>
          <TimePickerInput value={time} onChange={(value) => setTime(value || time)} />
        </div>
      </div>

      <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Durata</p>
      <div className="mb-4 grid grid-cols-5 gap-2">
        {DURATIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDuration(value)}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-full px-2 py-2 text-[13px] transition-colors",
              value === duration
                ? "bg-[#222222] font-semibold text-white"
                : "border border-[#dddddd] font-medium text-foreground hover:bg-[#f7f7f7]",
            )}
          >
            {value} min
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Allievo</p>
      {creatingStudent ? (
        // "Nuovo allievo" dal flyout: le tre cose che servono, niente di più
        // (stesso trattamento degli allievi creati dal consorzio, REG-464).
        <div className="mb-4 space-y-2 rounded-[12px] border border-[#e2e2e2] bg-[#fafafa] p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              autoFocus
              placeholder="Nome"
              value={newStudent.firstName}
              onChange={(event) =>
                setNewStudent((prev) => ({ ...prev, firstName: event.target.value }))
              }
            />
            <Input
              placeholder="Cognome"
              value={newStudent.lastName}
              onChange={(event) =>
                setNewStudent((prev) => ({ ...prev, lastName: event.target.value }))
              }
            />
          </div>
          <Input
            placeholder="Telefono"
            value={newStudent.phone}
            onChange={(event) => setNewStudent((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreatingStudent(false)}
              className="cursor-pointer text-[13px] font-semibold text-[#6a6a6a] underline"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={
                savingStudent ||
                !newStudent.firstName.trim() ||
                !newStudent.lastName.trim() ||
                newStudent.phone.trim().length < 5
              }
              onClick={() => void submitStudent()}
              className="cursor-pointer rounded-full bg-[#222222] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40"
            >
              {savingStudent ? <LoadingDots /> : "Aggiungi"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <StudentSearchSelect
            students={pickerStudents}
            value={studentId ?? ""}
            onChange={(id) => setStudentId(id)}
            placeholder="Cerca allievo…"
            footer={(close) => (
              <button
                type="button"
                onClick={() => {
                  close();
                  setCreatingStudent(true);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-[9px] px-3 py-2 text-left text-sm font-semibold text-foreground transition-colors hover:bg-[#f7f7f7]"
              >
                <Plus className="size-4" />
                Nuovo allievo
              </button>
            )}
          />
        </div>
      )}

      <p className="mb-1.5 text-[12px] font-semibold text-[#555555]">Veicolo del consorzio</p>
      <div className="relative mb-4">
        <TruckIcon />
        <select
          value={vehicleId ?? ""}
          onChange={(event) => setVehicleId(event.target.value || null)}
          className="w-full cursor-pointer appearance-none rounded-[12px] border border-[#e2e2e2] bg-white py-2.5 pl-10 pr-9 text-[14px] font-medium text-foreground outline-none"
        >
          <option value="">Scegli un veicolo</option>
          {data.vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.name}
            </option>
          ))}
        </select>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2"
        >
          <path d="M6 9l6 6 6-6" stroke="#9a9a9a" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {leadError && <p className="mb-3 text-[12.5px] font-medium text-[#b3261e]">{leadError}</p>}

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-[#f0f0f0] pt-4">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-[14px] font-semibold text-foreground underline"
        >
          Annulla
        </button>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => void send()}
          className="cursor-pointer rounded-[32px] bg-[#222222] px-[22px] py-[11px] text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:bg-[#ededed] disabled:text-[#a5a5a5]"
        >
          {sending ? <LoadingDots /> : "Invia richiesta"}
        </button>
      </div>
    </DialogShell>
  );
}

function TruckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6a6a6a"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
    >
      <path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.6" />
      <circle cx="17" cy="18" r="1.6" />
    </svg>
  );
}

const fmtFull = (iso: string) =>
  new Date(iso).toLocaleString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ── Controproposta del consorzio (Fase 9) ──────────────────────────── */

function ProposalDialog({
  request,
  onClose,
  onDone,
}: {
  request: AffiliateGuideRequestRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useFeedbackToast();
  const [busy, setBusy] = React.useState<"accept" | "reject" | null>(null);

  const respond = async (accept: boolean) => {
    setBusy(accept ? "accept" : "reject");
    const res = await respondToAffiliateProposedSlot({ requestId: request.id, accept });
    setBusy(null);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({
      description: accept
        ? "Orario accettato: la richiesta torna al consorzio per la conferma."
        : "Proposta rifiutata: resta la richiesta originale.",
    });
    onDone();
  };

  return (
    <DialogShell
      title="Il consorzio propone un altro orario"
      subtitle="Accettando, la richiesta si sposta sull'orario proposto e torna al consorzio per la conferma finale — l'istruttore lo sceglie lui."
      onClose={onClose}
      width={440}
    >
      <div className="mb-3 rounded-[14px] bg-[#f7f7f7] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#929292]">
          Avevi chiesto
        </p>
        <p className="mt-0.5 text-[14px] font-medium text-[#6a6a6a]">
          {fmtFull(request.requestedStartsAt)} · {request.durationMinutes} min
        </p>
      </div>
      <div className="mb-5 rounded-[14px] border-[1.5px] border-[#e0b93a] bg-[#fdf3d4] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.6px] text-[#8a6d0b]">
          Il consorzio propone
        </p>
        <p className="mt-0.5 text-[14px] font-bold text-[#6b5407]">
          {request.proposedStartsAt ? fmtFull(request.proposedStartsAt) : "—"}
          {request.proposedDurationMinutes ? ` · ${request.proposedDurationMinutes} min` : ""}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#f0f0f0] pt-4">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void respond(false)}
          className="cursor-pointer text-[14px] font-semibold text-foreground underline"
        >
          {busy === "reject" ? <LoadingDots /> : "Rifiuta"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void respond(true)}
          className="cursor-pointer rounded-[32px] bg-[#222222] px-[22px] py-[11px] text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "accept" ? <LoadingDots /> : "Accetta l'orario"}
        </button>
      </div>
    </DialogShell>
  );
}

/* ── Annullamento di una richiesta in attesa ─────────────────────────── */

function CancelRequestDialog({
  request,
  onClose,
  onDone,
}: {
  request: AffiliateGuideRequestRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useFeedbackToast();
  const [busy, setBusy] = React.useState(false);

  const cancel = async () => {
    setBusy(true);
    const res = await cancelAffiliateGuideRequest(request.id);
    setBusy(false);
    if (!res.success) {
      toast.error({ description: res.message });
      return;
    }
    toast.success({ description: "Richiesta annullata." });
    onDone();
  };

  return (
    <DialogShell title="Richiesta in attesa" onClose={onClose} width={420}>
      <div className="mb-5 rounded-[14px] bg-[#f7f7f7] px-4 py-3">
        <p className="text-[14px] font-semibold text-foreground">{request.studentName}</p>
        <p className="mt-0.5 text-[13px] font-medium text-[#6a6a6a]">
          {fmtFull(request.startsAt)} · {request.durationMinutes} min
        </p>
        {request.vehicleName ? (
          <p className="mt-0.5 text-[13px] font-medium text-[#6a6a6a]">{request.vehicleName}</p>
        ) : null}
      </div>
      <p className="mb-5 text-[13px] leading-[1.45] text-muted-foreground">
        Il consorzio non ha ancora risposto. Annullandola sparisce anche dalla sua campanella.
      </p>
      <div className="flex items-center justify-between gap-3 border-t border-[#f0f0f0] pt-4">
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-[14px] font-semibold text-foreground underline"
        >
          Lasciala lì
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void cancel()}
          className="cursor-pointer rounded-[32px] bg-[#222222] px-[22px] py-[11px] text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <LoadingDots /> : "Annulla richiesta"}
        </button>
      </div>
    </DialogShell>
  );
}

/* ── Scope "Autoscuola" nella vista ridotta ─────────────────────────── */

/**
 * L'agenda propria non è comprata: si vede piena (dati finti) ma **sfocata**,
 * con il cartello sopra. A restare nitida è la toolbar, segmented compreso —
 * uno solo, quello vero: un secondo switch sopra il velo sarebbe un doppione
 * e confonderebbe.
 */
function AutoscuolaScopeLocked({
  scopeControl,
}: {
  scopeControl: { value: Scope; onChange: (value: Scope) => void };
}) {
  const demo = useDemoAgendaSource();
  const source: AgendaSource = React.useMemo(
    () => ({
      ...demo,
      overlay: { node: <LockedCard {...LOCKED_SECTIONS.agenda} />, blur: true },
    }),
    [demo],
  );
  return <AutoscuoleAgendaPage tabs={null} source={source} consorzioScope={scopeControl} />;
}
