"use client";

import * as React from "react";
import { Loader2, Plus, Send, StickyNote, Trash2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import {
  getGroupLesson,
  updateGroupLesson,
  addGroupLessonParticipant,
  removeGroupLessonParticipant,
  listEligibleGroupLessonInvitees,
  cancelGroupLesson,
  updateAutoscuolaAppointmentDetails,
} from "@/lib/actions/autoscuole.actions";
import { inviteToGroupLesson } from "@/lib/actions/autoscuole-availability.actions";

type ResourceOption = { id: string; name: string };

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
  const [addId, setAddId] = React.useState<string>("");
  // Per-student note editing: which seat appointment is open + its draft text.
  const [noteEditing, setNoteEditing] = React.useState<string | null>(null);
  const [noteDraft, setNoteDraft] = React.useState("");
  // Local edit state for the "Sposta / modifica" section.
  const [startLocal, setStartLocal] = React.useState("");
  const [durationMin, setDurationMin] = React.useState("180");
  const [capacityStr, setCapacityStr] = React.useState("3");
  const [instructorId, setInstructorId] = React.useState<string>("");
  const [vehicleId, setVehicleId] = React.useState<string>("");

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
      }
      if (elig.success && elig.data) {
        setEligible(elig.data.map((e) => ({ id: e.id, name: e.name ?? "Allievo" })));
        setAddId("");
      }
    } finally {
      setLoading(false);
    }
  }, [groupLessonId]);

  React.useEffect(() => {
    if (open && groupLessonId) reload();
    if (!open) { setLesson(null); setEligible([]); }
  }, [open, groupLessonId, reload]);

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
  const handleAdd = async () => {
    if (!groupLessonId || !addId) return;
    if (await run(() => addGroupLessonParticipant({ groupLessonId, studentId: addId }), "Allievo aggiunto.")) reload();
  };
  const handleInvite = async () => {
    if (!groupLessonId) return;
    await run(() => inviteToGroupLesson({ groupLessonId }), "Invito inviato agli allievi idonei.");
  };
  const isMoto = lesson?.kind === "moto";
  const handleSaveEdit = async () => {
    if (!groupLessonId || !startLocal) return;
    if (!instructorId) {
      toast.error({ description: "Seleziona l'istruttore della guida di gruppo." });
      return;
    }
    const start = new Date(startLocal);
    const end = new Date(start.getTime() + Number(durationMin) * 60 * 1000);
    if (await run(
      () => updateGroupLesson({
        groupLessonId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        instructorId: instructorId || null,
        capacity: Number(capacityStr),
        // Moto group: keep the fleet and don't cascade a single vehicle onto
        // participants — each keeps its assigned moto.
        ...(isMoto ? {} : { vehicleId: vehicleId || null }),
      }),
      "Guida di gruppo aggiornata.",
    )) reload();
  };
  const handleCancelLesson = async () => {
    if (!groupLessonId) return;
    if (!window.confirm("Annullare la guida di gruppo? Tutti i partecipanti verranno avvisati.")) return;
    if (await run(() => cancelGroupLesson(groupLessonId), "Guida di gruppo annullata.")) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Guida di gruppo
            {lesson ? (
              <Badge variant="secondary" className="border-teal-200 bg-teal-100 text-teal-700">
                {lesson.filledSeats}/{lesson.capacity} posti
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Gestisci i partecipanti, l&apos;istruttore, il veicolo e l&apos;orario. Le modifiche valgono per tutti gli iscritti.
          </DialogDescription>
        </DialogHeader>

        {loading || !lesson ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Roster */}
            <div className="space-y-2">
              <Label>Partecipanti</Label>
              {lesson.participants.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessun iscritto. Aggiungi un allievo o invia gli inviti.</p>
              ) : (
                <div className="space-y-1.5">
                  {lesson.participants.map((p) => (
                    <div key={p.appointmentId} className="rounded-xl border border-border/60 bg-white px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-foreground">{p.studentName ?? "Allievo"}</span>
                          {isMoto ? (
                            <span className="block text-[11px] text-muted-foreground">
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
                        <div className="flex items-center gap-1">
                          <Button type="button" variant="ghost" size="sm" className="h-7 cursor-pointer px-2 text-teal-700 hover:bg-teal-50" disabled={busy} onClick={() => startEditNote(p.appointmentId, p.notes)} title="Nota per l'allievo">
                            <StickyNote className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 cursor-pointer px-2 text-rose-600 hover:bg-rose-50" disabled={busy} onClick={() => handleRemove(p.studentId)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {noteEditing === p.appointmentId ? (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            rows={3}
                            maxLength={2000}
                            placeholder="Nota per questo allievo (la vedrà nella sua app)"
                            className="text-sm"
                          />
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="ghost" size="sm" className="cursor-pointer" disabled={busy} onClick={() => setNoteEditing(null)}>Annulla</Button>
                            <Button type="button" size="sm" className="cursor-pointer" disabled={busy} onClick={() => handleSaveNote(p.appointmentId)}>
                              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salva nota
                            </Button>
                          </div>
                        </div>
                      ) : p.notes?.trim() ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted-foreground">{p.notes.trim()}</p>
                      ) : (
                        <button type="button" className="mt-1 cursor-pointer text-xs text-teal-700 hover:underline" disabled={busy} onClick={() => startEditNote(p.appointmentId, p.notes)}>
                          + Aggiungi nota
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add participant */}
            {lesson.openSeats > 0 ? (
              <div className="space-y-2">
                <Label>Aggiungi allievo</Label>
                <div className="flex gap-2">
                  <Select value={addId} onValueChange={setAddId}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder={eligible.length ? "Seleziona allievo idoneo" : "Nessun allievo idoneo"} />
                    </SelectTrigger>
                    <SelectContent>
                      {eligible.map((e) => (
                        <SelectItem key={e.id} value={e.id} className="cursor-pointer">{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" className="cursor-pointer shrink-0" disabled={busy || !addId} onClick={handleAdd}>
                    <Plus className="mr-1 h-4 w-4" /> Aggiungi
                  </Button>
                </div>
                <Button type="button" variant="outline" size="sm" className="cursor-pointer" disabled={busy} onClick={handleInvite}>
                  <Send className="mr-1.5 h-4 w-4" /> Invita allievi idonei ({lesson.openSeats} {lesson.openSeats === 1 ? "posto" : "posti"})
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Posti esauriti.</p>
            )}

            {/* Edit time / instructor / vehicle */}
            <div className="space-y-3 rounded-2xl border border-border/60 bg-gray-50/50 p-3">
              <Label>Modifica guida (vale per tutti)</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Inizio</span>
                  <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} className="cursor-pointer" />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Durata</span>
                  <Select value={durationMin} onValueChange={setDurationMin}>
                    <SelectTrigger className="cursor-pointer"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value} className="cursor-pointer">{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Capienza</span>
                  <Input
                    type="number"
                    min={Math.max(1, lesson?.filledSeats ?? 1)}
                    max={12}
                    value={capacityStr}
                    onChange={(e) => setCapacityStr(e.target.value)}
                    className="cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Istruttore (obbligatorio)</span>
                  <Select value={instructorId} onValueChange={setInstructorId}>
                    <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Seleziona istruttore" /></SelectTrigger>
                    <SelectContent>
                      {instructors.map((i) => (
                        <SelectItem key={i.id} value={i.id} className="cursor-pointer">{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {vehiclesEnabled && !isMoto ? (
                  <div className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">Veicolo</span>
                    <Select value={vehicleId} onValueChange={setVehicleId}>
                      <SelectTrigger className="cursor-pointer"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                      <SelectContent>
                        {vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id} className="cursor-pointer">{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              {/* Moto group: fleet + shared follow car (read-only summary). */}
              {isMoto ? (
                <div className="space-y-1 rounded-xl border border-border/50 bg-white px-3 py-2 text-xs">
                  <div className="text-muted-foreground">
                    Flotta:{" "}
                    <span className="font-medium text-foreground/85">
                      {lesson.fleet && lesson.fleet.length
                        ? lesson.fleet.map((v) => v.name).join(", ")
                        : "—"}
                    </span>
                  </div>
                  <div className="text-muted-foreground">
                    Auto al seguito:{" "}
                    <span className="font-medium text-foreground/85">
                      {lesson.followVehicleName ?? "Nessuna"}
                    </span>
                  </div>
                </div>
              ) : null}
              <Button type="button" size="sm" className="w-full cursor-pointer" disabled={busy} onClick={handleSaveEdit}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salva modifiche
              </Button>
            </div>

            {/* Cancel */}
            <Button type="button" variant="ghost" size="sm" className="w-full cursor-pointer text-rose-700 hover:bg-rose-50 hover:text-rose-700" disabled={busy} onClick={handleCancelLesson}>
              <X className="mr-1.5 h-4 w-4" /> Annulla guida di gruppo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
