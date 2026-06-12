"use client";

import * as React from "react";
import { Loader2, Megaphone, Plus, Search, Users, X } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { InlineToggle } from "@/components/ui/inline-toggle";
import { useFeedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";
import {
  createGroupLesson,
  getAutoscuolaVehicles,
  listOptedInGroupLessonStudents,
} from "@/lib/actions/autoscuole.actions";
import { inviteToGroupLesson } from "@/lib/actions/autoscuole-availability.actions";

type ResourceOption = { id: string; name: string };

type VehicleWithLicense = {
  id: string;
  name: string;
  licenseCategory: string | null;
  transmission: string | null;
};

type OptedInStudent = {
  id: string;
  name: string | null;
  licenseCategory: string | null;
  transmission: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instructors: ResourceOption[];
  vehiclesEnabled: boolean;
  /** Optional ISO date (YYYY-MM-DD) of the agenda's focused day to pre-fill. */
  defaultDate?: string | null;
  onCreated: () => void;
};

const CAPACITY_OPTIONS = [
  { value: "3", label: "3 allievi" },
  { value: "4", label: "4 allievi" },
];

const DURATIONS = [
  { value: "60", label: "1 ora" },
  { value: "120", label: "2 ore" },
  { value: "180", label: "3 ore" },
  { value: "240", label: "4 ore" },
];

// Accent/case-insensitive match so "Niccolo" finds "Niccolò" (schools can have
// hundreds of opted-in students).
const normalizeQuery = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const pad = (n: number) => String(n).padStart(2, "0");
const todayYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Exact license match, permissive when either side lacks data
// (mirrors backend vehicleServesLicense).
const vehicleServesStudent = (
  v: { licenseCategory: string | null; transmission: string | null } | null,
  st: { licenseCategory: string | null; transmission: string | null },
) => {
  if (!v || !v.licenseCategory || !v.transmission) return true;
  if (!st.licenseCategory || !st.transmission) return true;
  return v.licenseCategory === st.licenseCategory && v.transmission === st.transmission;
};

export function GroupLessonCreateDialog({
  open,
  onOpenChange,
  instructors,
  vehiclesEnabled,
  defaultDate,
  onCreated,
}: Props) {
  const toast = useFeedbackToast();
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [vehicles, setVehicles] = React.useState<VehicleWithLicense[]>([]);
  const [students, setStudents] = React.useState<OptedInStudent[]>([]);

  // Form state.
  const [day, setDay] = React.useState("");
  const [time, setTime] = React.useState("09:00");
  const [durationMin, setDurationMin] = React.useState("180");
  const [capacityStr, setCapacityStr] = React.useState("3");
  const CAPACITY = Number(capacityStr);
  const [instructorId, setInstructorId] = React.useState<string>("");
  const [vehicleId, setVehicleId] = React.useState<string>("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [openInvites, setOpenInvites] = React.useState(true);
  const [studentQuery, setStudentQuery] = React.useState("");

  // Load reference data (opted-in students + vehicles with license info) on open.
  React.useEffect(() => {
    if (!open) return;
    setDay(defaultDate || todayYMD());
    setTime("09:00");
    setDurationMin("180");
    setCapacityStr("3");
    setInstructorId("");
    setVehicleId("");
    setSelectedIds([]);
    setOpenInvites(true);
    setStudentQuery("");
    setSaving(false);
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [studRes, vehRes] = await Promise.all([
          listOptedInGroupLessonStudents(),
          vehiclesEnabled
            ? getAutoscuolaVehicles()
            : Promise.resolve({ success: true as const, data: [] }),
        ]);
        if (cancelled) return;
        if (studRes.success && studRes.data) setStudents(studRes.data);
        if (vehRes.success && Array.isArray(vehRes.data)) {
          setVehicles(
            (vehRes.data as Array<Record<string, unknown>>)
              .filter((v) => v.status === "active")
              .map((v) => ({
                id: String(v.id),
                name: String(v.name ?? "Veicolo"),
                licenseCategory: (v.licenseCategory as string | null) ?? null,
                transmission: (v.transmission as string | null) ?? null,
              })),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, defaultDate, vehiclesEnabled]);

  const selectedVehicle = React.useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );

  // Eligible to PRE-ADD: opted-in + license-compatible with the chosen vehicle.
  const eligibleStudents = React.useMemo(
    () => students.filter((st) => vehicleServesStudent(selectedVehicle, st)),
    [students, selectedVehicle],
  );

  // Drop any pre-selected student that no longer matches the chosen vehicle.
  React.useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) => eligibleStudents.some((st) => st.id === id)),
    );
  }, [eligibleStudents]);

  // Live search over the eligible list (accent/case-insensitive).
  const filteredStudents = React.useMemo(() => {
    const q = normalizeQuery(studentQuery.trim());
    if (!q) return eligibleStudents;
    return eligibleStudents.filter((st) => normalizeQuery(st.name ?? "").includes(q));
  }, [eligibleStudents, studentQuery]);

  const showSearch = eligibleStudents.length > 6;

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= CAPACITY) return prev;
      return [...prev, id];
    });
  };

  const handleCreate = async () => {
    if (!day || !time) {
      toast.error({ description: "Imposta data e ora della guida." });
      return;
    }
    if (vehiclesEnabled && !vehicleId) {
      toast.error({ description: "Seleziona il veicolo della guida di gruppo." });
      return;
    }
    const start = new Date(`${day}T${time}:00`);
    if (Number.isNaN(start.getTime())) {
      toast.error({ description: "Data non valida." });
      return;
    }
    const end = new Date(start.getTime() + Number(durationMin) * 60 * 1000);

    setSaving(true);
    try {
      const res = await createGroupLesson({
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        instructorId: instructorId || undefined,
        vehicleId: vehiclesEnabled ? vehicleId || undefined : undefined,
        capacity: CAPACITY,
        studentIds: selectedIds,
      });
      if (!res.success || !res.data) {
        toast.error({ description: res.message ?? "Creazione non riuscita." });
        setSaving(false);
        return;
      }
      // Optionally open the remaining seats to an invite.
      if (openInvites && res.data.participants < res.data.capacity) {
        const inv = await inviteToGroupLesson({ groupLessonId: res.data.groupLessonId });
        if (!inv.success) {
          toast.error({
            description:
              "Guida creata, ma l'invio degli inviti non è riuscito: " +
              (inv.message ?? "errore inatteso."),
          });
        }
      }
      toast.success({ description: "Guida di gruppo creata." });
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error({ description: (e as Error)?.message ?? "Errore inatteso." });
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Nuova guida di gruppo
            <Badge variant="secondary" className="border-teal-200 bg-teal-100 text-teal-700">
              fino a {CAPACITY} allievi
            </Badge>
          </DialogTitle>
          <DialogDescription>
            1 istruttore · {vehiclesEnabled ? "1 veicolo · " : ""}fino a {CAPACITY} allievi. Pre-inserisci
            gli allievi abilitati o apri i posti agli inviti.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* When / instructor / vehicle */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Giorno</Label>
                <Input
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Ora inizio</Label>
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="cursor-pointer"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Durata</Label>
                <Select value={durationMin} onValueChange={setDurationMin}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value} className="cursor-pointer">
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Istruttore</Label>
                <Select value={instructorId} onValueChange={setInstructorId}>
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue placeholder="Nessuno" />
                  </SelectTrigger>
                  <SelectContent>
                    {instructors.map((i) => (
                      <SelectItem key={i.id} value={i.id} className="cursor-pointer">
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Capienza</Label>
                <Select
                  value={capacityStr}
                  onValueChange={(v) => {
                    setCapacityStr(v);
                    // Lowering 4 → 3 with 4 pre-selected students: trim the list.
                    setSelectedIds((prev) => prev.slice(0, Number(v)));
                  }}
                >
                  <SelectTrigger className="cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAPACITY_OPTIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="cursor-pointer">
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {vehiclesEnabled ? (
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Veicolo</Label>
                  <Select value={vehicleId} onValueChange={setVehicleId}>
                    <SelectTrigger className="cursor-pointer">
                      <SelectValue placeholder="Seleziona veicolo" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id} className="cursor-pointer">
                          {v.name}
                          {v.licenseCategory ? ` · ${v.licenseCategory}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {/* Pre-add eligible opted-in students */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-teal-600" /> Pre-inserisci allievi
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  {selectedIds.length}/{CAPACITY}
                </span>
              </div>
              {vehiclesEnabled && !vehicleId ? (
                <p className="text-xs text-muted-foreground">
                  Scegli prima il veicolo per vedere gli allievi abilitati.
                </p>
              ) : eligibleStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nessun allievo abilitato alle guide di gruppo
                  {vehiclesEnabled ? " per questo veicolo" : ""}.
                </p>
              ) : (
                <>
                  {/* Selected students stay visible as removable chips even when the
                      search filter hides their row. */}
                  {selectedIds.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedIds.map((id) => {
                        const st = students.find((s) => s.id === id);
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleStudent(id)}
                            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-teal-300 bg-teal-50 py-1 pl-3 pr-2 text-xs font-medium text-teal-800 transition-colors hover:bg-teal-100"
                          >
                            <span className="max-w-[160px] truncate">{st?.name ?? "Allievo"}</span>
                            <X className="h-3 w-3 shrink-0 text-teal-600" />
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  {showSearch ? (
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        placeholder={`Cerca tra ${eligibleStudents.length} allievi…`}
                        className="pl-9 pr-9"
                      />
                      {studentQuery ? (
                        <button
                          type="button"
                          onClick={() => setStudentQuery("")}
                          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-gray-100 hover:text-foreground"
                          aria-label="Pulisci ricerca"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-2xl border border-border/60 bg-gray-50/50 p-2">
                    {filteredStudents.length === 0 ? (
                      <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                        Nessun allievo trovato per &laquo;{studentQuery.trim()}&raquo;.
                      </p>
                    ) : (
                      filteredStudents.map((st) => {
                        const checked = selectedIds.includes(st.id);
                        const atCapacity = !checked && selectedIds.length >= CAPACITY;
                        return (
                          <label
                            key={st.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-2.5 rounded-xl border bg-white px-3 py-2 transition-colors",
                              checked ? "border-teal-300 bg-teal-50/60" : "border-border/60",
                              atCapacity && "cursor-not-allowed opacity-40",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              disabled={atCapacity}
                              onCheckedChange={() => toggleStudent(st.id)}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                              {st.name ?? "Allievo"}
                            </span>
                            {st.licenseCategory ? (
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {st.licenseCategory}
                                {st.transmission ? ` · ${st.transmission}` : ""}
                              </span>
                            ) : null}
                          </label>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Open remaining seats to invites */}
            <div className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/60 px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white">
                <Megaphone className="h-4 w-4 text-teal-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  Apri i posti rimanenti agli inviti
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Gli allievi idonei riceveranno una notifica e potranno iscriversi.
                </div>
              </div>
              <InlineToggle
                checked={openInvites}
                onChange={() => setOpenInvites((v) => !v)}
                disabled={saving}
              />
            </div>

            {/* CTA */}
            <Button
              type="button"
              className="w-full cursor-pointer bg-pink-500 text-white hover:bg-pink-600"
              disabled={saving}
              onClick={handleCreate}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Crea guida di gruppo
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
