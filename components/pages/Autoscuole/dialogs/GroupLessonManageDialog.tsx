"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, Search as SearchIcon, Send, StickyNote, Trash2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PROTO_INPUT, PROTO_SELECT_TRIGGER } from "@/components/ui/proto-styles";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { LoadingDots } from "@/components/ui/loading-dots";
import {
  getGroupLesson,
  getAutoscuolaVehicles,
  updateGroupLesson,
  addGroupLessonParticipant,
  removeGroupLessonParticipant,
  listEligibleGroupLessonInvitees,
  cancelGroupLesson,
  updateAutoscuolaAppointmentDetails,
} from "@/lib/actions/autoscuole.actions";
import { inviteToGroupLesson } from "@/lib/actions/autoscuole-availability.actions";
import { instructorCanUseVehicle } from "@/lib/autoscuole/group-moto";
import { MOTO_LICENSE_CATEGORIES } from "@/lib/autoscuole/license";
import { cn } from "@/lib/utils";

type ResourceOption = { id: string; name: string };

type VehicleWithLicense = {
  id: string;
  name: string;
  licenseCategory: string | null;
  transmission: string | null;
  assignedInstructorId: string | null;
  poolInstructorIds: string[];
};

const MOTO_CATEGORIES = new Set<string>(MOTO_LICENSE_CATEGORIES);
const isMotoCategory = (c: string | null | undefined) => !!c && MOTO_CATEGORIES.has(c);

type GroupLessonDetail = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number;
  kind?: string;
  instructorId: string | null;
  instructorName: string | null;
  vehicleId: string | null;
  vehicleName: string | null;
  followVehicleId?: string | null;
  followVehicleName?: string | null;
  fleet?: { id: string; name: string; licenseCategory: string | null; transmission: string | null }[];
  filledSeats: number;
  openSeats: number;
  participants: {
    appointmentId: string;
    studentId: string;
    studentName: string | null;
    notes: string | null;
    vehicleId?: string | null;
    vehicleName?: string | null;
    licenseCategory?: string | null;
  }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupLessonId: string | null;
  instructors: ResourceOption[];
  vehicles: ResourceOption[];
  vehiclesEnabled: boolean;
  onChanged: () => void;
};

const DURATIONS = [
  { value: "60", label: "1 ora" },
  { value: "120", label: "2 ore" },
  { value: "180", label: "3 ore" },
  { value: "240", label: "4 ore" },
];

const pad = (n: number) => String(n).padStart(2, "0");
// Local datetime-local value (YYYY-MM-DDTHH:mm) from an ISO string.
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const durationOf = (startIso: string, endIso: string | null) => {
  if (!endIso) return 180;
  return Math.max(60, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
};
const fmtTime = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const fmtWhen = (startIso: string, endIso: string | null) => {
  const start = new Date(startIso);
  const date = start.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · ${fmtTime(start)}${endIso ? ` – ${fmtTime(new Date(endIso))}` : ""}`;
};
const initialsOf = (name: string | null | undefined) =>
  (name ?? "Allievo")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "A";

/** Riga di dettaglio stile Informazioni aziendali: label + valore + "Modifica";
 *  in modifica la riga si espande con l'editor passato come children. */
function DetailRow({
  label,
  value,
  editing,
  onEdit,
  children,
}: {
  label: string;
  value: React.ReactNode;
  editing: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#ebebeb] py-4">
      {editing ? (
        <div>
          <p className="mb-2.5 text-[15px] font-semibold text-foreground">{label}</p>
          {children}
        </div>
      ) : (
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-foreground">{label}</p>
            <p className="mt-0.5 text-[13.5px] font-medium leading-snug text-[#6a6a6a]">{value}</p>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="ml-6 shrink-0 cursor-pointer whitespace-nowrap text-sm font-semibold text-foreground underline underline-offset-2 hover:decoration-2"
          >
            Modifica
          </button>
        </div>
      )}
    </div>
  );
}

/** Footer degli editor inline: Salva near-black + Annulla testo. */
function EditFooter({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3.5 flex items-center gap-2.5">
      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="flex min-h-[40px] min-w-[78px] cursor-pointer items-center justify-center rounded-[8px] bg-[#222222] px-[18px] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
      >
        {busy ? <LoadingDots /> : "Salva"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onCancel}
        className="cursor-pointer rounded-[8px] px-[18px] py-2.5 text-sm font-semibold text-foreground hover:text-navy-900"
      >
        Annulla
      </button>
    </div>
  );
}

export function GroupLessonManageDialog({
  open,
  onOpenChange,
  groupLessonId,
  instructors,
  vehicles,
  vehiclesEnabled,
  onChanged,
}: Props) {
  const toast = useFeedbackToast();
  const [lesson, setLesson] = React.useState<GroupLessonDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [eligible, setEligible] = React.useState<ResourceOption[]>([]);
  // Aggiunta allievi: pannello laterale + filtro di ricerca + riga in
  // aggiunta + invito in corso.
  const [addPanelOpen, setAddPanelOpen] = React.useState(false);
  const [addSearch, setAddSearch] = React.useState("");
  const [addingId, setAddingId] = React.useState<string | null>(null);
  const [inviting, setInviting] = React.useState(false);
  // Per-student note editing: which seat appointment is open + its draft text.
  const [noteEditing, setNoteEditing] = React.useState<string | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  // Local edit state for the "Sposta / modifica" section.
  const [startLocal, setStartLocal] = React.useState("");
  const [durationMin, setDurationMin] = React.useState("180");
  const [capacityStr, setCapacityStr] = React.useState("3");
  const [instructorId, setInstructorId] = React.useState<string>("");
  const [vehicleId, setVehicleId] = React.useState<string>("");
  // Moto group: editable fleet + shared follow car (mirrors the mobile sheet).
  const [fleetIds, setFleetIds] = React.useState<string[]>([]);
  const [followId, setFollowId] = React.useState<string>("");
  const [allVehicles, setAllVehicles] = React.useState<VehicleWithLicense[]>([]);
  // Conferma annullamento inline (niente window.confirm).
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  // Riga dei dettagli attualmente in modifica (pattern Informazioni aziendali:
  // una riga alla volta, editor inline con Salva/Annulla).
  const [editingField, setEditingField] = React.useState<
    null | "when" | "capacity" | "instructor" | "vehicle" | "fleet" | "follow"
  >(null);

  const reload = React.useCallback(async () => {
    if (!groupLessonId) return;
    setLoading(true);
    try {
      const [res, elig] = await Promise.all([
        getGroupLesson(groupLessonId),
        listEligibleGroupLessonInvitees(groupLessonId),
      ]);
      if (res.success && res.data) {
        setLesson(res.data);
        setStartLocal(toLocalInput(res.data.startsAt));
        setDurationMin(String(durationOf(res.data.startsAt, res.data.endsAt)));
        setCapacityStr(String(res.data.capacity ?? 3));
        setInstructorId(res.data.instructorId ?? "");
        setVehicleId(res.data.vehicleId ?? "");
        setFleetIds((res.data.fleet ?? []).map((f) => f.id));
        setFollowId(res.data.followVehicleId ?? "");
      }
      if (elig.success && elig.data) {
        setEligible(elig.data.map((e) => ({ id: e.id, name: e.name ?? "Allievo" })));
      }
    } finally {
      setLoading(false);
    }
  }, [groupLessonId]);

  React.useEffect(() => {
    if (open && groupLessonId) reload();
    if (!open) {
      setLesson(null);
      setEligible([]);
      setConfirmCancel(false);
      setNoteEditing(null);
      setEditingField(null);
      setAddPanelOpen(false);
      setAddSearch("");
    }
  }, [open, groupLessonId, reload]);

  // Full vehicle list (with license + access info) for the moto fleet /
  // follow-car editors — the `vehicles` prop only carries id+name.
  React.useEffect(() => {
    if (!open || !vehiclesEnabled) return;
    getAutoscuolaVehicles().then((res) => {
      if (res.success && Array.isArray(res.data)) {
        setAllVehicles(
          (res.data as Array<Record<string, unknown>>)
            .filter((v) => v.status === "active")
            .map((v) => ({
              id: String(v.id),
              name: String(v.name ?? "Veicolo"),
              licenseCategory: (v.licenseCategory as string | null) ?? null,
              transmission: (v.transmission as string | null) ?? null,
              assignedInstructorId: (v.assignedInstructorId as string | null) ?? null,
              poolInstructorIds: (v.poolInstructorIds as string[] | undefined) ?? [],
            })),
        );
      }
    });
  }, [open, vehiclesEnabled]);

  // Only vehicles the (currently selected) instructor can use are pickable.
  const accessibleVehicles = React.useMemo(
    () => (instructorId ? allVehicles.filter((v) => instructorCanUseVehicle(v, instructorId)) : []),
    [allVehicles, instructorId],
  );
  const motoVehicles = React.useMemo(
    () => accessibleVehicles.filter((v) => isMotoCategory(v.licenseCategory)),
    [accessibleVehicles],
  );
  const carVehicles = React.useMemo(
    () => accessibleVehicles.filter((v) => v.licenseCategory === "B"),
    [accessibleVehicles],
  );
  // Standard group vehicle = a CAR (motos live in the moto flow only). The
  // currently-assigned vehicle stays selectable even if it fell out of the
  // accessible set (e.g. after an instructor change) — the BE validates.
  const standardVehicles = React.useMemo(() => {
    const list = accessibleVehicles.filter((v) => !isMotoCategory(v.licenseCategory));
    if (lesson?.vehicleId && !list.some((v) => v.id === lesson.vehicleId)) {
      list.push({
        id: lesson.vehicleId,
        name: lesson.vehicleName ?? "Veicolo attuale",
        licenseCategory: null,
        transmission: null,
        assignedInstructorId: null,
        poolInstructorIds: [],
      });
    }
    return list;
  }, [accessibleVehicles, lesson]);
  // Chips also show fleet motos that fell out of the accessible set (e.g. after
  // an instructor change) so the current state stays visible; the BE validates.
  const fleetOptions = React.useMemo(() => {
    const map = new Map(motoVehicles.map((v) => [v.id, { id: v.id, name: v.name, licenseCategory: v.licenseCategory }]));
    for (const f of lesson?.fleet ?? []) {
      if (!map.has(f.id)) map.set(f.id, { id: f.id, name: f.name, licenseCategory: f.licenseCategory });
    }
    return [...map.values()];
  }, [motoVehicles, lesson]);
  // A moto assigned to a participant cannot leave the fleet (BE rule).
  const assignedMotoIds = React.useMemo(
    () => new Set((lesson?.participants ?? []).map((p) => p.vehicleId).filter(Boolean) as string[]),
    [lesson],
  );

  const run = async (fn: () => Promise<{ success: boolean; message?: string }>, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.success) { toast.error({ description: res.message ?? "Operazione non riuscita." }); return false; }
      toast.success({ description: okMsg });
      onChanged();
      return true;
    } catch (e) {
      toast.error({ description: (e as Error)?.message ?? "Errore inatteso." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (studentId: string) => {
    if (!groupLessonId) return;
    if (await run(() => removeGroupLessonParticipant({ groupLessonId, studentId }), "Allievo rimosso.")) reload();
  };
  const startEditNote = (appointmentId: string, current: string | null) => {
    setNoteEditing(appointmentId);
    setNoteDraft(current ?? "");
  };
  // Per-student note lives on the participant's seat appointment; reuse the
  // standard appointment-details action (authorised for the owning instructor).
  const handleSaveNote = async (appointmentId: string) => {
    const next = noteDraft.trim();
    if (await run(
      () => updateAutoscuolaAppointmentDetails({ appointmentId, notes: next || null }),
      "Nota salvata.",
    )) { setNoteEditing(null); reload(); }
  };
  const handleAdd = async (studentId: string) => {
    if (!groupLessonId || !studentId) return;
    setAddingId(studentId);
    try {
      if (await run(() => addGroupLessonParticipant({ groupLessonId, studentId }), "Allievo aggiunto.")) reload();
    } finally {
      setAddingId(null);
    }
  };
  const handleInvite = async () => {
    if (!groupLessonId) return;
    setInviting(true);
    try {
      await run(() => inviteToGroupLesson({ groupLessonId }), "Invito inviato agli allievi idonei.");
    } finally {
      setInviting(false);
    }
  };
  const filteredEligible = React.useMemo(() => {
    const q = addSearch.trim().toLowerCase();
    return q ? eligible.filter((e) => e.name.toLowerCase().includes(q)) : eligible;
  }, [eligible, addSearch]);
  const isMoto = lesson?.kind === "moto";
  const handleSaveEdit = async () => {
    if (!groupLessonId || !startLocal) return false;
    if (!instructorId) {
      toast.error({ description: "Seleziona l'istruttore della guida di gruppo." });
      return false;
    }
    if (isMoto && fleetIds.length === 0) {
      toast.error({ description: "Seleziona almeno una moto per la guida di gruppo." });
      return false;
    }
    const start = new Date(startLocal);
    const end = new Date(start.getTime() + Number(durationMin) * 60 * 1000);
    const ok = await run(
      () => updateGroupLesson({
        groupLessonId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        instructorId: instructorId || null,
        capacity: Number(capacityStr),
        // Moto group: fleet + shared follow car; no vehicle cascade onto the
        // participants (each keeps its assigned moto).
        ...(isMoto
          ? { vehicleIds: fleetIds, followVehicleId: followId || null }
          : { vehicleId: vehicleId || null }),
      }),
      "Guida di gruppo aggiornata.",
    );
    if (ok) reload();
    return ok;
  };
  // Apre l'editor di una riga risincronizzando i draft dallo stato salvato
  // (una modifica annullata in precedenza non deve lasciare valori sporchi).
  const startEditField = (field: NonNullable<typeof editingField>) => {
    if (!lesson) return;
    setStartLocal(toLocalInput(lesson.startsAt));
    setDurationMin(String(durationOf(lesson.startsAt, lesson.endsAt)));
    setCapacityStr(String(lesson.capacity ?? 3));
    setInstructorId(lesson.instructorId ?? "");
    setVehicleId(lesson.vehicleId ?? "");
    setFleetIds((lesson.fleet ?? []).map((f) => f.id));
    setFollowId(lesson.followVehicleId ?? "");
    setEditingField(field);
  };
  const saveEditingField = async () => {
    if (await handleSaveEdit()) setEditingField(null);
  };
  const handleCancelLesson = async () => {
    if (!groupLessonId) return;
    if (await run(() => cancelGroupLesson(groupLessonId), "Guida di gruppo annullata.")) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* overflow-visible sul Content: il pannello "Aggiungi allievi" sporge
          a destra della card; lo scroll vive sul wrapper interno. */}
      <DialogContent className="max-w-[520px] gap-0 overflow-visible rounded-[20px] p-0">
        <div className="max-h-[88vh] overflow-y-auto rounded-[20px] p-7 pb-6">
        {/* ── Header ── */}
        <div className="flex items-center gap-2.5 pr-10">
          <DialogTitle className="text-[19px] font-bold tracking-[-0.2px] text-foreground">
            {lesson?.kind === "moto" ? "Guida di gruppo moto" : "Guida di gruppo"}
          </DialogTitle>
          {lesson ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-[0.3px]",
                lesson.kind === "moto" ? "bg-[#fdeedd] text-[#b45309]" : "bg-[#f2f2f2] text-[#555555]",
              )}
            >
              {lesson.filledSeats}/{lesson.capacity} posti
            </span>
          ) : null}
        </div>
        <DialogDescription className="mt-1 text-[13px] font-medium leading-normal text-[#929292]">
          Gestisci i partecipanti, l&apos;istruttore, il veicolo e l&apos;orario. Le modifiche valgono per tutti gli iscritti.
        </DialogDescription>

        {loading || !lesson ? (
          <div className="flex justify-center py-14">
            <LoadingDots className="text-[#929292]" />
          </div>
        ) : (
          <div className="mt-4">
            {/* ── Dettagli della guida: righe con Modifica inline ── */}
            <DetailRow
              label="Data e ora"
              value={fmtWhen(lesson.startsAt, lesson.endsAt)}
              editing={editingField === "when"}
              onEdit={() => startEditField("when")}
            >
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="datetime-local"
                  autoFocus
                  value={startLocal}
                  onChange={(e) => setStartLocal(e.target.value)}
                  className={cn(PROTO_INPUT, "cursor-pointer")}
                />
                <Select value={durationMin} onValueChange={setDurationMin}>
                  <SelectTrigger className={PROTO_SELECT_TRIGGER}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value} className="cursor-pointer">{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <EditFooter busy={busy} onSave={saveEditingField} onCancel={() => setEditingField(null)} />
            </DetailRow>

            <DetailRow
              label="Capienza"
              value={`${lesson.capacity} ${lesson.capacity === 1 ? "posto" : "posti"} · ${lesson.filledSeats} ${lesson.filledSeats === 1 ? "occupato" : "occupati"}`}
              editing={editingField === "capacity"}
              onEdit={() => startEditField("capacity")}
            >
              <input
                type="number"
                autoFocus
                min={Math.max(1, lesson.filledSeats)}
                max={12}
                value={capacityStr}
                onChange={(e) => setCapacityStr(e.target.value)}
                className={cn(PROTO_INPUT, "max-w-[140px]")}
              />
              <EditFooter busy={busy} onSave={saveEditingField} onCancel={() => setEditingField(null)} />
            </DetailRow>

            <DetailRow
              label="Istruttore"
              value={lesson.instructorName ?? "Da assegnare"}
              editing={editingField === "instructor"}
              onEdit={() => startEditField("instructor")}
            >
              <Select value={instructorId} onValueChange={setInstructorId}>
                <SelectTrigger className={cn(PROTO_SELECT_TRIGGER, "max-w-[320px]")}>
                  <SelectValue placeholder="Seleziona istruttore" />
                </SelectTrigger>
                <SelectContent>
                  {instructors.map((i) => (
                    <SelectItem key={i.id} value={i.id} className="cursor-pointer">{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <EditFooter busy={busy} onSave={saveEditingField} onCancel={() => setEditingField(null)} />
            </DetailRow>

            {vehiclesEnabled && !isMoto ? (
              <DetailRow
                label="Veicolo"
                value={lesson.vehicleName ?? "Nessuno"}
                editing={editingField === "vehicle"}
                onEdit={() => startEditField("vehicle")}
              >
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger className={cn(PROTO_SELECT_TRIGGER, "max-w-[320px]")}>
                    <SelectValue placeholder="Nessuno" />
                  </SelectTrigger>
                  <SelectContent>
                    {standardVehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="cursor-pointer">{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <EditFooter busy={busy} onSave={saveEditingField} onCancel={() => setEditingField(null)} />
              </DetailRow>
            ) : null}

            {isMoto ? (
              <>
                <DetailRow
                  label="Moto della guida"
                  value={
                    (lesson.fleet ?? []).length
                      ? (lesson.fleet ?? []).map((f) => f.name).join(", ")
                      : "Nessuna moto"
                  }
                  editing={editingField === "fleet"}
                  onEdit={() => startEditField("fleet")}
                >
                  <div className="flex flex-wrap gap-2">
                    {fleetOptions.map((v) => {
                      const checked = fleetIds.includes(v.id);
                      // Una moto già assegnata a un partecipante non può uscire dal parco.
                      const locked = checked && assignedMotoIds.has(v.id);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={busy || locked}
                          title={locked ? "Assegnata a un partecipante: non rimovibile" : undefined}
                          onClick={() =>
                            setFleetIds((prev) =>
                              prev.includes(v.id) ? prev.filter((x) => x !== v.id) : [...prev, v.id],
                            )
                          }
                          className={cn(
                            "flex cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] px-3.5 py-2 text-[13px] font-semibold transition-colors",
                            checked
                              ? "border-[#f0c49a] bg-[#fdf0e3] text-[#9a5b1f]"
                              : "border-[#e0e0e0] bg-white text-[#666666] hover:border-[#c9c9c9]",
                            locked && "cursor-not-allowed opacity-70",
                          )}
                        >
                          <span className="max-w-[160px] truncate">{v.name}</span>
                          {v.licenseCategory ? (
                            <span className="text-[11px] font-medium text-[#a3a3a3]">{v.licenseCategory}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  <EditFooter busy={busy} onSave={saveEditingField} onCancel={() => setEditingField(null)} />
                </DetailRow>

                <DetailRow
                  label="Auto al seguito"
                  value={lesson.followVehicleName ?? "Nessuna"}
                  editing={editingField === "follow"}
                  onEdit={() => startEditField("follow")}
                >
                  <Select value={followId || "__none__"} onValueChange={(v) => setFollowId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className={cn(PROTO_SELECT_TRIGGER, "max-w-[320px]")}>
                      <SelectValue placeholder="Nessuna" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="cursor-pointer">Nessuna</SelectItem>
                      {carVehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id} className="cursor-pointer">{v.name}</SelectItem>
                      ))}
                      {followId && !carVehicles.some((v) => v.id === followId) && lesson.followVehicleName ? (
                        <SelectItem value={followId} className="cursor-pointer">{lesson.followVehicleName}</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                  <p className="mt-[7px] text-xs font-medium leading-[1.45] text-[#a3a3a3]">
                    La tua scelta vale sempre: se la togli, la guida resta senza auto al seguito.
                  </p>
                  <EditFooter busy={busy} onSave={saveEditingField} onCancel={() => setEditingField(null)} />
                </DetailRow>
              </>
            ) : null}

            {/* ── Partecipanti ── */}
            <div className="mb-3 mt-6 flex items-baseline justify-between">
              <span className="text-[15px] font-semibold text-foreground">Partecipanti</span>
              <span className="text-[12.5px] font-medium text-[#929292]">
                {lesson.openSeats > 0
                  ? `${lesson.openSeats} ${lesson.openSeats === 1 ? "posto libero" : "posti liberi"}`
                  : "Posti esauriti"}
              </span>
            </div>
            {lesson.participants.length === 0 ? (
              <p className="text-[12.5px] font-medium text-[#929292]">
                Nessun iscritto. Aggiungi un allievo o invia gli inviti.
              </p>
            ) : (
              <div className="rounded-[12px] border-[1.5px] border-[#ededed]">
                {lesson.participants.map((p, idx) => (
                  <div key={p.appointmentId} className={cn("px-4 py-3", idx > 0 && "border-t border-[#f0f0f0]")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 select-none items-center justify-center rounded-full bg-[#f2f2f2] text-[12px] font-bold text-[#555555]">
                          {initialsOf(p.studentName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">{p.studentName ?? "Allievo"}</span>
                          {isMoto ? (
                            <span className="block text-[12px] font-medium text-[#929292]">
                              {p.vehicleName ? (
                                <>
                                  {p.vehicleName}
                                  {p.licenseCategory ? ` · ${p.licenseCategory}` : ""}
                                </>
                              ) : (
                                "Moto a rotazione"
                              )}
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          title="Nota per l'allievo"
                          disabled={busy}
                          onClick={() => startEditNote(p.appointmentId, p.notes)}
                          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-[#6a6a6a] transition-colors hover:bg-[#f7f7f7] hover:text-foreground disabled:opacity-50"
                        >
                          <StickyNote className="size-4" strokeWidth={1.8} />
                        </button>
                        <button
                          type="button"
                          title="Rimuovi dalla guida"
                          disabled={busy}
                          onClick={() => handleRemove(p.studentId)}
                          className="flex size-8 cursor-pointer items-center justify-center rounded-full text-[#c13515] transition-colors hover:bg-[#fdf3f1] disabled:opacity-50"
                        >
                          <Trash2 className="size-4" strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                    {noteEditing === p.appointmentId ? (
                      <div className="mt-2">
                        <textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          rows={3}
                          maxLength={2000}
                          placeholder="Nota per questo allievo (la vedrà nella sua app)"
                          className="w-full resize-y rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 py-2.5 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-[#c1c1c1] focus:border-[#222222]"
                        />
                        <div className="mt-1.5 flex items-center justify-end gap-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setNoteEditing(null)}
                            className="cursor-pointer px-1 text-[13px] font-semibold text-foreground transition-colors hover:text-[#555555]"
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleSaveNote(p.appointmentId)}
                            className="flex min-w-[96px] cursor-pointer items-center justify-center rounded-full bg-[#1a1a2e] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#2d2d4a] disabled:opacity-60"
                          >
                            {busy ? <LoadingDots className="scale-[0.6]" /> : "Salva nota"}
                          </button>
                        </div>
                      </div>
                    ) : p.notes?.trim() ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] font-medium text-[#929292]">{p.notes.trim()}</p>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => startEditNote(p.appointmentId, p.notes)}
                        className="mt-1 cursor-pointer text-[12.5px] font-semibold text-foreground underline underline-offset-2 hover:decoration-2 disabled:opacity-50"
                      >
                        + Aggiungi nota
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Aggiungi allievi: trigger del pannello laterale ── */}
            {lesson.openSeats > 0 ? (
              <>
                <div className="mb-2 mt-6 text-[15px] font-semibold text-foreground">Aggiungi allievi</div>
                {eligible.length === 0 ? (
                  <p className="text-[12.5px] font-medium text-[#929292]">
                    Nessun allievo idoneo da aggiungere in questo momento.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddPanelOpen((v) => !v)}
                    className={cn(
                      "inline-flex cursor-pointer select-none items-center gap-2 rounded-full border-[1.5px] px-[22px] py-[11px] text-sm font-semibold transition-colors",
                      addPanelOpen
                        ? "border-[#222222] bg-[#f7f7f7] text-foreground"
                        : "border-[#dddddd] text-foreground hover:border-[#222222] hover:bg-[#f7f7f7]",
                    )}
                  >
                    <Plus className="size-4" strokeWidth={2} />
                    Sfoglia allievi idonei · {eligible.length}
                  </button>
                )}

                {/* Invito in app agli idonei non ancora iscritti */}
                <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] bg-[#f7f8fa] px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Send className="size-4 shrink-0 text-[#6a6a6a]" strokeWidth={1.8} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground">Invita gli allievi idonei</p>
                      <p className="text-[12px] font-medium leading-snug text-[#929292]">
                        Notifica in app a chi può partecipare · {lesson.openSeats}{" "}
                        {lesson.openSeats === 1 ? "posto libero" : "posti liberi"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleInvite}
                    className="flex min-w-[84px] shrink-0 cursor-pointer select-none items-center justify-center rounded-full bg-[#1a1a2e] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#2d2d4a] disabled:opacity-60"
                  >
                    {inviting ? <LoadingDots className="scale-[0.6]" /> : "Invita"}
                  </button>
                </div>
              </>
            ) : null}

            {/* ── Annulla guida (conferma inline) ── */}
            {confirmCancel ? (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-[12px] bg-[#fdf3f1] px-4 py-3">
                <span className="text-[13px] font-medium leading-snug text-[#7a2e1d]">
                  Annullare la guida? Tutti i partecipanti verranno avvisati.
                </span>
                <div className="flex shrink-0 items-center gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmCancel(false)}
                    className="cursor-pointer px-1 text-[13px] font-semibold text-foreground transition-colors hover:text-[#555555]"
                  >
                    No
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCancelLesson}
                    className="flex min-w-[100px] cursor-pointer items-center justify-center rounded-full bg-[#c13515] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#a52d12] disabled:opacity-60"
                  >
                    {busy ? <LoadingDots className="scale-[0.6]" /> : "Sì, annulla"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmCancel(true)}
                className="mt-3 flex w-full cursor-pointer items-center justify-center rounded-full py-3 text-sm font-semibold text-[#c13515] transition-colors hover:bg-[#fdf3f1] disabled:opacity-60"
              >
                Annulla guida di gruppo
              </button>
            )}
          </div>
        )}
        </div>

        {/* ── Pannello laterale "Aggiungi allievi": card gemella a destra ── */}
        <AnimatePresence>
          {addPanelOpen && lesson && lesson.openSeats > 0 && eligible.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="absolute left-[calc(100%+14px)] top-0 flex max-h-[88vh] w-[340px] flex-col rounded-[20px] border border-border bg-white p-6 shadow-card-primary"
            >
              <div className="flex items-center justify-between">
                <span className="text-[17px] font-bold tracking-[-0.2px] text-foreground">
                  Aggiungi allievi
                </span>
                <button
                  type="button"
                  aria-label="Chiudi elenco"
                  onClick={() => setAddPanelOpen(false)}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-[#f7f7f7] transition-colors hover:bg-[#e9e9e9]"
                >
                  <X className="size-3.5 text-foreground" strokeWidth={2} />
                </button>
              </div>
              <p className="mt-0.5 text-[12.5px] font-medium text-[#929292]">
                Idonei per questa guida · {lesson.openSeats}{" "}
                {lesson.openSeats === 1 ? "posto libero" : "posti liberi"}
              </p>
              <div className="mt-3 flex items-center gap-2.5 rounded-[10px] border-[1.5px] border-[#dddddd] px-3.5 transition-colors focus-within:border-[#222222]">
                <SearchIcon className="size-4 shrink-0 text-[#a8a8a8]" strokeWidth={1.8} />
                <input
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Cerca un allievo"
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent py-[9px] text-sm font-medium text-foreground outline-none placeholder:text-[#c1c1c1]"
                />
              </div>
              <div className="mt-2.5 min-h-0 flex-1 overflow-y-auto rounded-[12px] border-[1.5px] border-[#ededed]">
                {filteredEligible.length === 0 ? (
                  <p className="px-4 py-3.5 text-[12.5px] font-medium text-[#929292]">
                    Nessun allievo trovato per &laquo;{addSearch}&raquo;.
                  </p>
                ) : (
                  filteredEligible.map((e, idx) => (
                    <div
                      key={e.id}
                      className={cn(
                        "flex items-center justify-between gap-3 px-3.5 py-2.5",
                        idx > 0 && "border-t border-[#f0f0f0]",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 select-none items-center justify-center rounded-full bg-[#f2f2f2] text-[11px] font-bold text-[#555555]">
                          {initialsOf(e.name)}
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">{e.name}</span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleAdd(e.id)}
                        className="flex min-w-[88px] shrink-0 cursor-pointer select-none items-center justify-center gap-1 rounded-full border-[1.5px] border-[#dddddd] px-3 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:border-[#222222] hover:bg-[#f7f7f7] disabled:opacity-50"
                      >
                        {addingId === e.id ? (
                          <LoadingDots className="scale-[0.6]" />
                        ) : (
                          <>
                            <Plus className="size-3.5" strokeWidth={2} /> Aggiungi
                          </>
                        )}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
